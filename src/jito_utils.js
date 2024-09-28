//This file handles the control of JITO Bundles. Wrapping, getting tip and managing TXs
import bs58 from 'bs58'
import Websocket from 'ws'
import ora from 'ora'
import { Keypair, PublicKey, SystemProgram, TransactionMessage, VersionedTransaction } from '@solana/web3.js'

import {
    balanceCheck,
    cancelOrder,
    checkArray,
    checkOpenOrders,
    connection,
    createTx,
    getBalance,
    infinityBuyInputLamports,
    infinityBuyOutputLamports,
    infinitySellInputLamports,
    infinitySellOutputLamports,
    maxJitoTip,
    payer,
    selectedAddressA,
    selectedAddressB,
    selectedTokenA,
    selectedTokenB
} from './jupgrid.js'

import { delay } from './utils.js'

export {
    encodeTransactionToBase58,
    jitoTipCheck,
    jitoController,
    jitoCancelOrder,
    jitoSetInfinity,
    jitoRebalance,
    handleJitoBundle,
    sendJitoBundle
}

const [MIN_WAIT, MAX_WAIT] = [5e2, 5e3]
const JitoBlockEngine = 'https://mainnet.block-engine.jito.wtf/api/v1/bundles'
const TIP_ACCOUNTS = [
    '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
    'HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe',
    'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
    'ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49',
    'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh',
    'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt',
    'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL',
    '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT'
]
const getRandomTipAccount = () =>
    TIP_ACCOUNTS[Math.floor(Math.random() * TIP_ACCOUNTS.length)]

let {
    jitoRetry = 0,
} = {}

function encodeTransactionToBase58 (transaction) {
    // Function to encode a transaction to base58
    const encodedTransaction = bs58.encode(transaction.serialize())
    return encodedTransaction
}

async function jitoTipCheck () {
    const JitoTipWS = 'ws://bundles-api-rest.jito.wtf/api/v1/bundles/tip_stream'
    const tipws = new Websocket(JitoTipWS)
    let resolveMessagePromise
    let rejectMessagePromise

    // Create a promise that resolves with the first message received
    const messagePromise = new Promise((resolve, reject) => {
        resolveMessagePromise = resolve
        rejectMessagePromise = reject
    })

    // Open WebSocket connection
    tipws.on('open', function open () {
    })

    // Handle messages
    tipws.on('message', function incoming (data) {
        var enc = new TextDecoder('utf-8')
        const str = enc.decode(data) // Convert Buffer to string

        try {
            const json = JSON.parse(str) // Parse string to JSON
            const emaPercentile50th = json[0].ema_landed_tips_50th_percentile // Access the 50th percentile property
            console.log(`50th Percentile: ${emaPercentile50th.toFixed(9)}`)
            if (emaPercentile50th !== null) {
                resolveMessagePromise(emaPercentile50th)
            } else {
                rejectMessagePromise(new Error('50th percentile is null'))
            }
        } catch (err) {
            rejectMessagePromise(err)
        }
    })

    // Handle errors
    tipws.on('error', function error (err) {
        console.error('WebSocket error:', err)
        rejectMessagePromise(err)
    })

    try {
        // Wait for the first message or a timeout
        const emaPercentile50th = await Promise.race([
            messagePromise,
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 21000))
        ])

        tipws.close() // Close WebSocket connection
        return emaPercentile50th
    } catch (err) {
        console.error(err)
        tipws.close() // Close WebSocket connection
        return 0.00005 // Return a default of 0.00005 if the request fails
    }
}

async function jitoController (task) {
    let result = 'unknown'
    // Initial operation
    switch (task) {
        case 'cancel':
            result = await jitoCancelOrder(task)
            break
        case 'infinity':
            result = await jitoSetInfinity(task)
            break
        case 'rebalance':
            result = await jitoRebalance(task)
            break
        default:
            // unintended code
            console.log('Unknown Error state. Exiting...')
            process.exit(0)
    }
    jitoRetry = 1
    // Retry loop
    while (jitoRetry < 20) {
        switch (result) {
            case 'succeed':
                console.log('Operation Succeeded\n')

                jitoRetry = 21
                break
            case 'cancelFail':
                console.log('Retrying Cancel Orders...')
                jitoRetry++
                result = await jitoCancelOrder(task)
                break
            case 'infinityFail':
                console.log('Retrying Infinity Orders...')
                jitoRetry++
                result = await jitoSetInfinity(task)
                break
            case 'rebalanceFail':
                console.log('Retrying Rebalance Orders...')
                jitoRetry++
                result = await jitoRebalance(task)
                break
            default:
                console.log('Unknown Error state. Exiting...')
                process.exit(0)
        }
    }
}

async function jitoCancelOrder (task) {
    await checkOpenOrders()
    if (checkArray.length === 0) {
        console.log('No orders found to cancel.')
        return 'succeed'
    } else {
        console.log('Cancelling Orders')
        const transaction1 = await cancelOrder(checkArray, payer)
        if (transaction1 === 'skip') {
            console.log('Skipping Cancel...')
            return 'succeed'
        }
        const result = await handleJitoBundle(task, transaction1)
        return result
    }
}

async function jitoSetInfinity (task) {
    // cancel any existing, place 2 new
    const base1 = Keypair.generate()
    const base2 = Keypair.generate()

    await checkOpenOrders()

    if (checkArray.length === 0) {
        console.log('No orders found to cancel.')
        const order1 = await createTx(
            infinityBuyInputLamports,
            infinityBuyOutputLamports,
            selectedAddressA,
            selectedAddressB,
            base1
        )
        const order2 = await createTx(
            infinitySellInputLamports,
            infinitySellOutputLamports,
            selectedAddressB,
            selectedAddressA,
            base2
        )
        const transaction1 = order1.transaction
        const transaction2 = order2.transaction
        const transactions = [transaction1, transaction2]
        const result = await handleJitoBundle(task, ...transactions)
        return result
    } else {
        console.log('Found Orders to Cancel')
        //Triple check for open orders
        await checkOpenOrders()
        const transaction1 = await cancelOrder(checkArray, payer)
        const order1 = await createTx(
            infinityBuyInputLamports,
            infinityBuyOutputLamports,
            selectedAddressA,
            selectedAddressB,
            base1
        )
        const order2 = await createTx(
            infinitySellInputLamports,
            infinitySellOutputLamports,
            selectedAddressB,
            selectedAddressA,
            base2
        )
        const transaction2 = order1.transaction
        const transaction3 = order2.transaction
        const transactions = [transaction1, transaction2, transaction3]
        const result = await handleJitoBundle(task, ...transactions)
        return result
    }
}

async function jitoRebalance (task) {
    const transaction1 = await balanceCheck()
    if (transaction1 === 'skip') {
        console.log('Skipping Rebalance...')
        return 'succeed'
    }
    const result = await handleJitoBundle(task, transaction1)
    return result
}

async function handleJitoBundle (task, ...transactions) {
    let tipValueInSol
    try {
        tipValueInSol = await jitoTipCheck()
    } catch (err) {
        console.error(err)
        tipValueInSol = 0.00005 // Replace 0 with your default value
    }
    if (tipValueInSol > maxJitoTip) {
        tipValueInSol = maxJitoTip
    }
    const tipValueInLamports = tipValueInSol * 1_000_000_000
    const roundedTipValueInLamports = Math.round(tipValueInLamports)

    // Limit to 9 digits
    const limitedTipValueInLamports = Math.floor(
        Number(roundedTipValueInLamports.toFixed(9)) * 1.1 //+10% of tip to edge out competition
    )
    try {
        const tipAccount = new PublicKey(getRandomTipAccount())
        const instructionsSub = []
        const tipIxn = SystemProgram.transfer({
            fromPubkey: payer.publicKey,
            toPubkey: tipAccount,
            lamports: limitedTipValueInLamports
        })
        // console.log("Tries: ",retries);
        console.log(
            `Jito Fee: ${limitedTipValueInLamports / Math.pow(10, 9)} SOL`
        )
        instructionsSub.push(tipIxn)
        const resp = await connection.getLatestBlockhash('confirmed')

        const messageSub = new TransactionMessage({
            payerKey: payer.publicKey,
            recentBlockhash: resp.blockhash,
            instructions: instructionsSub
        }).compileToV0Message()

        const txSub = new VersionedTransaction(messageSub)
        txSub.sign([payer])
        const bundletoSend = [...transactions, txSub]

        // Ensure that bundletoSend is not empty
        if (bundletoSend.length === 0) {
            throw new Error('Bundle is empty.')
        }

        // Call sendJitoBundle with the correct bundleToSend
        const result = await sendJitoBundle(task, bundletoSend)
        return result
    } catch (error) {
        console.error('\nBundle Construction Error: ', error)
    }
}

async function sendJitoBundle (task, bundletoSend) {
    const encodedBundle = bundletoSend.map(encodeTransactionToBase58)

    const { balanceA: preJitoA, balanceB: preJitoB } = await getBalance(
        payer,
        selectedAddressA,
        selectedAddressB,
        selectedTokenA,
        selectedTokenB
    )
    await checkOpenOrders()
    const preBundleOrders = checkArray

    const data = {
        jsonrpc: '2.0',
        id: 1,
        method: 'sendBundle',
        params: [encodedBundle]
    }

    let response
    const maxRetries = 5
    for (let i = 0; i <= maxRetries; i++) {
        try {
            response = await fetch(JitoBlockEngine, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            })

            if (response.ok) break

            if (response.status === 429) {
                const waitTime = Math.min(MIN_WAIT * Math.pow(2, i), MAX_WAIT)
                const jitter = Math.random() * 0.3 * waitTime
                await new Promise((resolve) =>
                    setTimeout(resolve, waitTime + jitter)
                )
            } else {
                throw new Error('Unexpected error')
            }
        } catch (error) {
            if (i === maxRetries) {
                console.error('Max retries exceeded')
                program.exit(0)
            }
        }
    }
    const responseText = await response.text()
    const responseData = JSON.parse(responseText)

    const result = responseData.result
    const url = `https://explorer.jito.wtf/bundle/${result}`
    console.log(`\nResult ID: ${url}`)

    console.log('Checking for 30 seconds...')
    let jitoChecks = 1
    const maxChecks = 30
    let spinner
    let bundleLanded = false
    while (jitoChecks <= maxChecks) {
        spinner = ora(
            `Checking Jito Bundle Status... ${jitoChecks}/${maxChecks}`
        ).start()
        console.log('\nTask: ', task)
        try {
            // Wait 1 second before each balance check to avoid error 429
            await delay(1000) // Adding delay here
            const { balanceA: postJitoA, balanceB: postJitoB } = await getBalance(
                payer,
                selectedAddressA,
                selectedAddressB,
                selectedTokenA,
                selectedTokenB
            )
            if (postJitoA !== preJitoA || postJitoB !== preJitoB) {
                bundleLanded = true
                spinner.stop()
                console.log(
                    '\nBundle Landed, waiting for orders to finalize...'
                )
                if (task !== 'rebalance') {
                    let bundleChecks = 1
                    while (bundleChecks <= 30) {
                        let postBundleOrders
                        await checkOpenOrders()
                        postBundleOrders = checkArray
                        if (postBundleOrders !== preBundleOrders) {
                            console.log(
                                '\nBundle Landed, Orders Updated, Skipping Timer'
                            )
                            await delay(1000)
                            jitoChecks = 31
                            break
                        } else {
                            console.log(
                                `Checking Orders for ${bundleChecks} of 30 seconds`
                            )
                            await delay(1000)
                            bundleChecks++
                        }
                    }
                }
                jitoChecks = 31
                break
            }
            jitoChecks++
        } catch (error) {
            console.error('Error in balance check:', error)
        }
        spinner.stop()
    }

    if (spinner) {
        spinner.stop()
    }
    console.log('Waiting for 5 seconds - This is for testing...')
    await delay(5000)
    await checkOpenOrders()
    switch (task) {
        case 'cancel':
            if (checkArray.length > 0) {
                console.log('Cancelling Orders Failed, Retrying...')
                return 'cancelFail'
            } else {
                console.log('Orders Cancelled Successfully')
                return 'succeed'
            }
        case 'infinity':
            if (checkArray.length !== 2) {
                console.log('Placing Infinity Orders Failed, Retrying...')
                return 'infinityFail'
            } else {
                console.log('Infinity Orders Placed Successfully')
                return 'succeed'
            }
        case 'rebalance':
            if (bundleLanded) {
                console.log('Rebalancing Tokens Successful')
                return 'succeed'
            } else {
                console.log('Rebalancing Tokens Failed, Retrying...')
                return 'rebalanceFail'
            }
        default:
            console.log('Unknown state, retrying...')
            return 'unknown'
    }
}