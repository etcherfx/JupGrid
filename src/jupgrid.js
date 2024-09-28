// #region imports
import axios from 'axios'
import chalk from 'chalk'
import fetch from 'cross-fetch'
import * as fs from 'fs'

import { LimitOrderProvider, ownerFilter } from '@jup-ag/limit-order-sdk'
import * as solanaWeb3 from '@solana/web3.js'
import { Connection, VersionedTransaction } from '@solana/web3.js'

import { envload, loaduserSettings, saveuserSettings } from './settings.js'
import { delay, downloadTokensList, getTokenAccounts, getTokens, questionAsync, rl } from './utils.js'
import { jitoController, } from './jito_utils.js'
import asciichart from 'asciichart'
// #endregion

// #region exports
export {
	initialize,
    checkOpenOrders,
    cancelOrder,
    createTx,
    balanceCheck,
    getBalance,
	connection,
	payer,
    selectedAddressA,
    selectedAddressB,
    selectedTokenA,
    selectedTokenB,
    infinityBuyInputLamports,
    infinityBuyOutputLamports,
    infinitySellInputLamports,
    infinitySellOutputLamports,
	checkArray,
	maxJitoTip
};
// #endregion

// #region constants
// use fs to to read version from package.json
const packageInfo = JSON.parse(fs.readFileSync("package.json", "utf8"));

let currentVersion = packageInfo.version;
let configVersion = currentVersion;

const [payer, rpcUrl] = envload();

const connection = new Connection(rpcUrl, "processed", {
	confirmTransactionInitialTimeout: 5000
});
const limitOrder = new LimitOrderProvider(connection);

let shutDown = false;

const walletAddress = payer.publicKey.toString();
const displayAddress = `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`;

const quoteurl = "https://quote-api.jup.ag/v6/quote";


const USDC_MINT_ADDRESS = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SOL_MINT_ADDRESS = "So11111111111111111111111111111111111111112";
// #endregion


// #region properties
let {
	validTokenA = null,
	validTokenB = null,
	selectedTokenA = null,
	selectedTokenB = null,
	selectedAddressA = null,
	selectedAddressB = null,
	selectedDecimalsA = null,
	selectedDecimalsB = null,
	validSpread = null,
	stopLossUSD = null,
	infinityTarget = null,
	loaded = false,
	openOrders = [],
	checkArray = [],
	tokens = [],
	newPrice = null,
	startPrice = null,
	spread = null,
	spreadbps = null,
	initBalanceA = 0,
	initUsdBalanceA = 0,
	initBalanceB = 0,
	initUsdBalanceB = 0,
	currBalanceA = 0,
	currBalanceB = 0,
	currUSDBalanceA = 0,
	currUSDBalanceB = 0,
	initUsdTotalBalance = 0,
	currUsdTotalBalance = 0,
	tokenRebalanceValue = null,
	tokenARebalanceValue = 0,
	tokenBRebalanceValue = 0,
	startTime = new Date(),
	monitorDelay = null,
	adjustmentA = 0,
	adjustmentB = 0,
	stopLoss = false,
	maxJitoTip = null,
	infinityBuyInputLamports,
	infinityBuyOutputLamports,
	infinitySellInputLamports,
	infinitySellOutputLamports,
	counter = 0,
	askForRebalance = true,
	rebalanceCounter = 0,
	newPriceBUp = null,
	newPriceBDown = null,
	lastKnownPrice = null,
	currentTracker = null,
	sellPrice = null,
	buyPrice = null,
	iteration = 0,
	userSettings = {
		selectedTokenA: null,
		selectedTokenB: null,
		tradeSize: null,
		spread: null,
		rebalanceAllowed: null,
		rebalancePercentage: null,
		rebalanceSlippageBPS: null,
		monitorDelay: null,
		stopLossUSD: null,
		infinityTarget: null,
		infinityMode: null
	}
} = {};
// #endregion

//Util Functions
function formatElapsedTime(startTime) {
	const currentTime = new Date();
	const elapsedTime = currentTime - startTime; // Difference in milliseconds

	let totalSeconds = Math.floor(elapsedTime / 1000);
	let hours = Math.floor(totalSeconds / 3600);
	totalSeconds %= 3600;
	let minutes = Math.floor(totalSeconds / 60);
	let seconds = totalSeconds % 60;

	// Padding with '0' if necessary
	hours = String(hours).padStart(2, "0");
	minutes = String(minutes).padStart(2, "0");
	seconds = String(seconds).padStart(2, "0");

	console.log(`\u{23F1}  Run time: ${hours}:${minutes}:${seconds}`);
}

async function fetchPrice(tokenAddress) {
    const response = await axios.get(`https://price.jup.ag/v6/price?ids=${tokenAddress}`);
    const price = response.data.data[tokenAddress].price;
    return parseFloat(price);
}

async function updateUSDVal(mintAddress, balance, decimals) {
    try {
        let price = await fetchPrice(mintAddress);
        let balanceLamports = Math.floor(balance * Math.pow(10, decimals));
        const usdBalance = balanceLamports * price;
        const usdBalanceLamports =usdBalance / Math.pow(10, decimals);
        return usdBalanceLamports;
    } catch (error) {
        // Error is not critical.
        // Reuse the previous balances and try another update again next cycle.
    }
}

async function fetchNewUSDValues() {
	const tempUSDBalanceA = await updateUSDVal(
	  selectedAddressA,
	  currBalanceA,
	  selectedDecimalsA
	);
	const tempUSDBalanceB = await updateUSDVal(
	  selectedAddressB,
	  currBalanceB,
	  selectedDecimalsB
	);
  
	return {
	  newUSDBalanceA: tempUSDBalanceA ?? currUSDBalanceA,
	  newUSDBalanceB: tempUSDBalanceB ?? currUSDBalanceB,
	};
}

function calculateProfitOrLoss(currUsdTotalBalance, initUsdTotalBalance) {
	const profitOrLoss = currUsdTotalBalance - initUsdTotalBalance;
	const percentageChange = (profitOrLoss / initUsdTotalBalance) * 100;
	return { profitOrLoss, percentageChange };
}
  
function displayProfitOrLoss(profitOrLoss, percentageChange) {
	if (profitOrLoss > 0) {
	  console.log(
		`Profit : ${chalk.green(`+$${profitOrLoss.toFixed(2)} (+${percentageChange.toFixed(2)}%)`)}`
	  );
	} else if (profitOrLoss < 0) {
	  console.log(
		`Loss : ${chalk.red(`-$${Math.abs(profitOrLoss).toFixed(2)} (-${Math.abs(percentageChange).toFixed(2)}%)`)}`
	  );
	} else {
	  console.log(`Difference : $${profitOrLoss.toFixed(2)} (0.00%)`); // Neutral
	}
}

async function updatePrice() {
	let retries = 0;
	const maxRetries = 5;
    while (retries < maxRetries) {
        try {
            let newPrice = await fetchPrice(selectedAddressB);
            if(newPrice !== undefined) {
                lastKnownPrice = newPrice;
                return newPrice;
            }
        } catch (error) {
            console.error(`Fetch price failed. Attempt ${retries + 1} of ${maxRetries}`);
        }
        retries++;
    }

    if(lastKnownPrice !== null) {
        return lastKnownPrice;
    } else {
        throw new Error("Unable to fetch price and no last known price available");
    }
}

async function formatTokenPrice(price) {
    let multiplier = 1;
    let quantity = "";

    if (price >= 1) {
        // For prices above $1, no adjustment needed
        return { multiplier, quantity };
    } else {
        // Adjust for prices below $1
        if (price <= 0.00000001) {
            multiplier = 100000000;
            quantity = "per 100,000,000";
        } else if (price <= 0.0000001) {
            multiplier = 10000000;
            quantity = "per 10,000,000";
        } else if (price <= 0.000001) {
            multiplier = 1000000;
            quantity = "per 1,000,000";
        } else if (price <= 0.00001) {
            multiplier = 100000;
            quantity = "per 100,000";
        } else if (price <= 0.0001) {
            multiplier = 10000;
            quantity = "per 10,000";
        } else if (price <= 0.001) {
            multiplier = 1000;
            quantity = "per 1,000";
        } else if (price <= 0.99) {
            multiplier = 100;
            quantity = "per 100";
        } else if (price >= 1) {
            multiplier = 1; // No change needed, but included for clarity
            quantity = ""; // No additional quantity description needed
        }
        return { multiplier, quantity };
    }
}

async function getBalance(
	payer,
	selectedAddressA,
	selectedAddressB,
	selectedTokenA,
	selectedTokenB
) {
	async function getSOLBalanceAndUSDC() {
		const lamports = await connection.getBalance(payer.publicKey);
		const solBalance = lamports / solanaWeb3.LAMPORTS_PER_SOL;
		if (solBalance === 0) {
			console.log(`You do not have any SOL, please check and try again.`);
			process.exit(0);
		}
		let usdBalance = 0;
		if (selectedTokenA === "SOL" || selectedTokenB === "SOL") {
			try {
				const queryParams = {
					inputMint: SOL_MINT_ADDRESS,
					outputMint: USDC_MINT_ADDRESS,
					amount: lamports, // Amount in lamports
					slippageBps: 0
				};
				const response = await axios.get(quoteurl, {
					params: queryParams
				});
				usdBalance = response.data.outAmount / Math.pow(10, 6) || 0;
				tokenRebalanceValue =
					response.data.outAmount / (lamports / Math.pow(10, 3));
			} catch (error) {
				console.error("Error fetching USDC equivalent for SOL:", error);
			}
		}
		return { balance: solBalance, usdBalance, tokenRebalanceValue };
	}

	async function getTokenAndUSDCBalance(mintAddress, decimals) {
		if (
			!mintAddress ||
			mintAddress === "So11111111111111111111111111111111111111112"
		) {
			return getSOLBalanceAndUSDC();
		}

		const tokenAccounts = await getTokenAccounts(
			connection,
			payer.publicKey,
			mintAddress
		);
		if (tokenAccounts.value.length > 0) {
			const balance =
				tokenAccounts.value[0].account.data.parsed.info.tokenAmount
					.uiAmount;
			let usdBalance = 0;
			if (balance === 0) {
				console.log(
					`You do not have a balance for ${mintAddress}, please check and try again.`
				);
				process.exit(0);
			}
			if (mintAddress !== USDC_MINT_ADDRESS) {
				const queryParams = {
					inputMint: mintAddress,
					outputMint: USDC_MINT_ADDRESS,
					amount: Math.floor(balance * Math.pow(10, decimals)),
					slippageBps: 0
				};

				try {
					const response = await axios.get(quoteurl, {
						params: queryParams
					});
					// Save USD Balance and adjust down for Lamports
					usdBalance = response.data.outAmount / Math.pow(10, 6);
					tokenRebalanceValue =
						response.data.outAmount / (balance * Math.pow(10, 6));
				} catch (error) {
					console.error("Error fetching USDC equivalent:", error);
					usdBalance = 1;
				}
			} else {
				usdBalance = balance; // If the token is USDC, its balance is its USD equivalent
				if (usdBalance === 0) {
					console.log(
						`You do not have any USDC, please check and try again.`
					);
					process.exit(0);
				}
				tokenRebalanceValue = 1;
			}

			return { balance, usdBalance, tokenRebalanceValue };
		} else {
			return { balance: 0, usdBalance: 0, tokenRebalanceValue: null };
		}
	}

	const resultA = await getTokenAndUSDCBalance(
		selectedAddressA,
		selectedDecimalsA
	);
	const resultB = await getTokenAndUSDCBalance(
		selectedAddressB,
		selectedDecimalsB
	);

	if (resultA.balance === 0 || resultB.balance === 0) {
		console.log(
			"Please ensure you have a balance in both tokens to continue."
		);
		process.exit(0);
	}

	return {
		balanceA: resultA.balance,
		usdBalanceA: resultA.usdBalance,
		tokenARebalanceValue: resultA.tokenRebalanceValue,
		balanceB: resultB.balance,
		usdBalanceB: resultB.usdBalance,
		tokenBRebalanceValue: resultB.tokenRebalanceValue
	};
}

//Initialize functions
async function loadQuestion() {
	try {
		await downloadTokensList();
		console.log("Updated Token List\n");
		console.log(`Connected Wallet: ${displayAddress}\n`);

		if (!fs.existsSync("userSettings.json")) {
			console.log("No user data found. Starting with fresh inputs.");
			initialize();
		} else {
			const askForLoadSettings = () => {
				rl.question(
					"Do you wish to load your saved settings? (Y/N): ",
					function (responseQ) {
						responseQ = responseQ.toUpperCase(); // Case insensitivity

						if (responseQ === "Y") {
							try {
								// Show user data
								const userSettings = loaduserSettings();
								// Check if the saved version matches the current version
									if (userSettings.configVersion !== currentVersion) {
										console.log(`Version mismatch detected. Your settings version: ${userSettings.configVersion}, current version: ${currentVersion}.`);
										// Here you can choose to automatically initialize with fresh settings
										// or prompt the user for an action (e.g., update settings, discard, etc.)
										console.log("Changing to blank settings, please continue.\n");
										initialize(); // Example action: re-initialize with fresh settings
										return;
									}
								console.log("User data loaded successfully.");
								console.log(
									`\nPrevious JupGrid Settings:
Version: ${userSettings.configVersion}
Token A: ${chalk.cyan(userSettings.selectedTokenA)}
Token B: ${chalk.magenta(userSettings.selectedTokenB)}
Token B Target Value: ${userSettings.infinityTarget}
Spread: ${userSettings.spread}%
Stop Loss: ${userSettings.stopLossUSD}
Maximum Jito Tip: ${userSettings.maxJitoTip} SOL
Monitoring delay: ${userSettings.monitorDelay}ms\n`
								);
								// Prompt for confirmation to use these settings
								rl.question(
									"Proceed with these settings? (Y/N): ",
									function (confirmResponse) {
										confirmResponse =
											confirmResponse.toUpperCase();
										if (confirmResponse === "Y") {
											// Apply loaded settings
											({
												currentVersion,
												selectedTokenA,
												selectedAddressA,
												selectedDecimalsA,
												selectedTokenB,
												selectedAddressB,
												selectedDecimalsB,
												spread,
												monitorDelay,
												stopLossUSD,
												maxJitoTip,
												infinityTarget
											} = userSettings);
											console.log(
												"Settings applied successfully!"
											);
											initialize();
										} else if (confirmResponse === "N") {
											console.log(
												"Discarding saved settings, please continue."
											);
											initialize(); // Start initialization with blank settings
										} else {
											console.log(
												"Invalid response. Please type 'Y' or 'N'."
											);
											askForLoadSettings(); // Re-ask the original question
										}
									}
								);
							} catch (error) {
								console.error(
									`Failed to load settings: ${error}`
								);
								initialize(); // Proceed with initialization in case of error
							}
						} else if (responseQ === "N") {
							console.log("Starting with blank settings.");
							initialize();
						} else {
							console.log(
								"Invalid response. Please type 'Y' or 'N'."
							);
							askForLoadSettings(); // Re-ask if the response is not Y/N
						}
					}
				);
			};

			askForLoadSettings(); // Start the question loop
		}
	} catch (error) {
		console.error("Error:", error);
	}
}

async function initialize() {
	tokens = await getTokens();
	
	if (selectedTokenA != null) {
		validTokenA = true;
	}

	if (selectedTokenB != null) {
		validTokenB = true;
	}

	if (spread != null) {
		validSpread = true;
	}

	let validMonitorDelay = false;
	if (monitorDelay >= 1000) {
		validMonitorDelay = true;
	}

	let validStopLossUSD = false;
	if (stopLossUSD != null) {
		validStopLossUSD = true;
	}

	let validJitoMaxTip = false;
	if (maxJitoTip != null) {
		validJitoMaxTip = true;
	}

	let validInfinityTarget = false;
	if (infinityTarget != null) {
		validInfinityTarget = true;
	}

	if (userSettings.selectedTokenA) {
  	const tokenAExists = tokens.some(
    (token) => token.symbol === userSettings.selectedTokenA
  	);
  	if (!tokenAExists) {
    console.log(
      `Token ${userSettings.selectedTokenA} from user data not found in the updated token list. Please re-enter.`
    );
    userSettings.selectedTokenA = null; // Reset selected token A
    userSettings.selectedAddressA = null; // Reset selected address
    userSettings.selectedDecimalsA = null; // Reset selected token decimals
  } else {
    validTokenA = true;
  }
	}

	while (!validTokenA) {
	console.log("\nDuring this Beta stage, we are only allowing USDC as Token A. Is that ok?");
	// Simulate the user entered 'USDC' as their answer
	let answer = 'USDC';

  const token = tokens.find((t) => t.symbol === answer);
  if (token) {
    console.log(`Selected Token: ${token.symbol}
Token Address: ${token.address}
Token Decimals: ${token.decimals}`);
    const confirmAnswer = await questionAsync(
      `Is this the correct token? (Y/N): `
    );
    if (
      confirmAnswer.toLowerCase() === "y" ||
      confirmAnswer.toLowerCase() === "yes"
    ) {
      validTokenA = true;
      selectedTokenA = token.symbol;
      selectedAddressA = token.address;
      selectedDecimalsA = token.decimals;
    }
  } else { 
    console.log(`Token ${answer} not found. Please Try Again.`);
  }
	}

	if (userSettings.selectedTokenB) {
		const tokenBExists = tokens.some(
			(token) => token.symbol === userSettings.selectedTokenB
		);
		if (!tokenBExists) {
			console.log(
				`Token ${userSettings.selectedTokenB} from user data not found in the updated token list. Please re-enter.`
			);
			userSettings.selectedTokenB = null; // Reset selected token B
			userSettings.selectedAddressB = null; // Reset selected address
			userSettings.selectedDecimalsB = null; // Reset selected token decimals
		} else {
			validTokenB = true;
		}
	}

	while (!validTokenB) {
		const answer = await questionAsync(
			`\nPlease Enter The Second Token Symbol (B) (Case Sensitive): `
		);
		const token = tokens.find((t) => t.symbol === answer);
		if (token) {
			console.log(`Selected Token: ${token.symbol}
Token Address: ${token.address}
Token Decimals: ${token.decimals}`);
			const confirmAnswer = await questionAsync(
				`Is this the correct token? (Y/N): `
			);
			if (
				confirmAnswer.toLowerCase() === "y" ||
				confirmAnswer.toLowerCase() === "yes"
			) {
				validTokenB = true;
				selectedTokenB = token.symbol;
				selectedAddressB = token.address;
				selectedDecimalsB = token.decimals;
			}
		} else {
			console.log(`Token ${answer} not found. Please Try Again.`);
		}
	}

	// If infinity target value is not valid, prompt the user
	while (!validInfinityTarget) {
		const infinityTargetInput = await questionAsync(
			`\nPlease Enter the Token B Target Value (in USD): `
		);
		infinityTarget = Math.floor(parseFloat(infinityTargetInput));
		if (
			!isNaN(infinityTarget) &&
			Number.isInteger(infinityTarget) &&
			infinityTarget > userSettings.stopLossUSD
		) {
			userSettings.infinityTarget = infinityTarget;
			validInfinityTarget = true;
		} else {
			console.log(
				"Invalid Token B Target value. Please enter a valid integer that is larger than the stop loss value."
			);
		}
	}

	// Ask user for spread %
	// Check if spread percentage is valid
	if (userSettings.spread) {
		validSpread = !isNaN(parseFloat(userSettings.spread));
		if (!validSpread) {
			console.log(
				"Invalid spread percentage found in user data. Please re-enter."
			);
			userSettings.spread = null; // Reset spread percentage
		} else validSpread = true;
	}

	// If spread percentage is not valid, prompt the user
	while (!validSpread) {
		const spreadInput = await questionAsync(
			`\nWhat % Spread Difference Between Market and Orders?
Recommend >0.3% to cover Jupiter Fees, but 1% or greater for best performance:`
		);
		spread = parseFloat(spreadInput);
		if (!isNaN(spread)) {
			userSettings.spread = spread;
			validSpread = true;
		} else {
			console.log(
				"Invalid spread percentage. Please enter a valid number (No % Symbol)."
			);
		}
	}

	if (userSettings.stopLossUSD) {
		validStopLossUSD = !isNaN(parseFloat(userSettings.stopLossUSD));
		if (!validStopLossUSD) {
			console.log(
				"Invalid stop loss value found in user data. Please re-enter."
			);
			userSettings.stopLossUSD = null; // Reset stop loss value
		} else validStopLossUSD = true;
	}

	// If stop loss value is not valid, prompt the user
	while (!validStopLossUSD) {
		const stopLossUSDInput = await questionAsync(
			`\nPlease Enter the Stop Loss Value in USD: 
(Enter 0 for no stoploss) `
		);
		stopLossUSD = parseFloat(stopLossUSDInput);
		if (!isNaN(stopLossUSD)) {
			userSettings.stopLossUSD = stopLossUSD;
			validStopLossUSD = true;
		} else {
			console.log(
				"Invalid stop loss value. Please enter a valid number."
			);
		}
	}

	while (!validJitoMaxTip) {
		const maxJitoTipQuestion = await questionAsync(
			`\nEnter the maximum Jito tip in SOL
This is the maximum tip you are willing to pay for a Jito order,
However, we use a dynamic tip based on the last 30 minute average tip.
(Default 0.0002 SOL, Minimum 0.00001): `
		);
		// Check if input is empty and set default value
		if (maxJitoTipQuestion.trim() === '') {
			maxJitoTip = 0.0002;
			validJitoMaxTip = true;
		} else {
			const parsedMaxJitoTip = parseFloat(maxJitoTipQuestion.trim());
			if (!isNaN(parsedMaxJitoTip) && parsedMaxJitoTip >= 0.00001) {
				maxJitoTip = parsedMaxJitoTip;
				validJitoMaxTip = true;
			} else {
				console.log(
					"Invalid Jito tip. Please enter a valid number greater than or equal to 0.00001."
				);
			}
		}
	
	}

	while (!validMonitorDelay) {
		const monitorDelayQuestion = await questionAsync(
			`\nEnter the delay between price checks in milliseconds.
(minimum 100ms, recommended/default > 5000ms): `
		);
		// Check if input is empty and set default value
		if (monitorDelayQuestion.trim() === '') {
			monitorDelay = 5000;
			validMonitorDelay = true;
		} else {
			const parsedMonitorDelay = parseInt(monitorDelayQuestion.trim());
			if (!isNaN(parsedMonitorDelay) && parsedMonitorDelay >= 100) {
				monitorDelay = parsedMonitorDelay;
				validMonitorDelay = true;
			} else {
				console.log(
					"Invalid monitor delay. Please enter a valid number greater than or equal to 1000."
				);
			}
		}
	}

	spreadbps = spread * 100;
	//rl.close(); // Close the readline interface after question loops are done.

	saveuserSettings(
		configVersion,
		selectedTokenA,
		selectedAddressA,
		selectedDecimalsA,
		selectedTokenB,
		selectedAddressB,
		selectedDecimalsB,
		spread,
		monitorDelay,
		stopLossUSD,
		maxJitoTip,
		infinityTarget
	);
	// First Price check during init
	console.log("Getting Latest Price Data...");
	newPrice = await fetchPrice(selectedAddressB);
	startPrice = newPrice;

	console.clear();
	console.log(`Starting JupGrid v${packageInfo.version};
Your Token Selection for A - Symbol: ${chalk.cyan(selectedTokenA)}, Address: ${chalk.cyan(selectedAddressA)}
Your Token Selection for B - Symbol: ${chalk.magenta(selectedTokenB)}, Address: ${chalk.magenta(selectedAddressB)}`);
	startInfinity();
}

if (loaded === false) {
	loadQuestion();
}

//Start Functions
async function startInfinity() {
	console.log(`Checking for existing orders to cancel...`);
	await jitoController("cancel");
	const initialBalances = await getBalance(
		payer,
		selectedAddressA,
		selectedAddressB,
		selectedTokenA,
		selectedTokenB
	);
	initBalanceA = initialBalances.balanceA;
	initUsdBalanceA = initialBalances.usdBalanceA;
	initBalanceB = initialBalances.balanceB;
	initUsdBalanceB = initialBalances.usdBalanceB;
	initUsdTotalBalance = initUsdBalanceA + initUsdBalanceB;
	infinityGrid();
}

//Jito Functions
async function infinityGrid() {
	if (shutDown) return;

	// Increment trades counter
	counter++;

	// Cancel any existing orders
	await jitoController("cancel");

	// Check to see if we need to rebalance
	await jitoController("rebalance");
	askForRebalance = false;

    // Get the current balances
    const { balanceA, balanceB } = await getBalance(payer, selectedAddressA, selectedAddressB, selectedTokenA, selectedTokenB);
    let balanceALamports = balanceA * Math.pow(10, selectedDecimalsA);
    let balanceBLamports = balanceB * Math.pow(10, selectedDecimalsB);

    // Get the current market price
    const marketPrice = await fetchPrice(selectedAddressB);
	await delay(1000)
	const marketPrice2 = await fetchPrice(selectedAddressB);
	await delay(1000)
	const marketPrice3 = await fetchPrice(selectedAddressB);
	const averageMarketPrice = (marketPrice + marketPrice2 + marketPrice3) / 3;
    currUsdTotalBalance = balanceA + (balanceB * averageMarketPrice);
	console.log(`Current USD Total Balance: ${currUsdTotalBalance}`)

	// Emergency Stop Loss
	if (currUsdTotalBalance < stopLossUSD) {
		console.clear();
		console.log(`\n\u{1F6A8} Emergency Stop Loss Triggered! - Exiting`);
		stopLoss = true;
		process.kill(process.pid, "SIGINT");
	}
    // Calculate the new prices of tokenB when it's up and down by the spread%
    newPriceBUp = averageMarketPrice * (1 + (spreadbps * 1.3) / 10000);
    newPriceBDown = averageMarketPrice * (1 - spreadbps / 10000);
    
    // Calculate the current value of TokenB in USD
    const currentValueUSD = balanceBLamports / Math.pow(10, selectedDecimalsB) * averageMarketPrice;
    
    // Calculate the target value of TokenB in USD at the new prices
    const targetValueUSDUp = balanceBLamports / Math.pow(10, selectedDecimalsB) * newPriceBUp;
    const targetValueUSDDown = balanceBLamports / Math.pow(10, selectedDecimalsB) * newPriceBDown;
    
    // Calculate the initial lamports to sell and buy
    let lamportsToSellInitial = Math.floor((targetValueUSDUp - infinityTarget) / newPriceBUp * Math.pow(10, selectedDecimalsB)/0.998);
    let lamportsToBuyInitial = Math.floor((infinityTarget - targetValueUSDDown) / newPriceBDown * Math.pow(10, selectedDecimalsB)/0.998);

    // Adjust the lamports to buy based on the potential cancellation of the sell order
    let lamportsToBuy = lamportsToBuyInitial - lamportsToSellInitial;

    // lamportsToSell remains the same as lamportsToSellInitial
    let lamportsToSell = lamportsToSellInitial;

    // Calculate the expected USDC for the sell and buy
	const decimalDiff = selectedDecimalsB - selectedDecimalsA;
    const expectedUSDCForSell = (lamportsToSell * newPriceBUp) / Math.pow(10, selectedDecimalsB);
    const expectedUSDCForBuy = (lamportsToBuy * newPriceBDown) / Math.pow(10, selectedDecimalsB);
    const expectedUSDCForSellLamports = Math.floor((lamportsToSell * newPriceBUp) / Math.pow(10, decimalDiff));
	const expectedUSDCForBuyLamports = Math.floor((lamportsToBuy * newPriceBDown) / Math.pow(10, decimalDiff));

    // Derive the MarketUp and MarketDown prices from the lamports to buy/sell
    const derivedMarketPriceUp = expectedUSDCForSellLamports / lamportsToSell;
    const derivedMarketPriceDown = expectedUSDCForBuyLamports / lamportsToBuy;

	//Translate variables to be used for jitoController
	infinityBuyInputLamports = expectedUSDCForBuyLamports;
	infinityBuyOutputLamports = lamportsToBuy;
	infinitySellInputLamports = lamportsToSell;
	infinitySellOutputLamports = expectedUSDCForSellLamports;

	// Check if the balances are enough to place the orders (With a 5% buffer)
	if (infinitySellInputLamports > balanceBLamports * 1.05) {
		console.log("Token B Balance not enough to place Sell Order. Exiting.");
		process.kill(process.pid, "SIGINT");
	}
	if (infinityBuyInputLamports > balanceALamports * 1.05) {
		console.log("Token A Balance not enough to place Buy Order. Exiting.");
		process.kill(process.pid, "SIGINT");
	}
    // Log the values

	/*
    console.log(`TokenA Balance: ${balanceA}`);
    console.log(`TokenA Balance Lamports: ${balanceALamports}`);
    console.log(`TokenB Balance: ${balanceB}`);
    console.log(`TokenB Balance Lamports: ${balanceBLamports}`);
    console.log(`TokenB Balance USD: ${currentValueUSD}`);
    console.log(`Infinity Target: ${infinityTarget}`);
    console.log(`Market Price: ${marketPrice.toFixed(2)}`);
    console.log(`Market Price Up: ${newPriceBUp.toFixed(2)}`);
    console.log(`Derived Market Price Up: ${derivedMarketPriceUp.toFixed(2)}`);
    console.log(`Market Price Down: ${newPriceBDown.toFixed(2)}`);
    console.log(`Derived Market Price Down: ${derivedMarketPriceDown.toFixed(2)}`);
    console.log(`Target Value of TokenB in USD Up: ${targetValueUSDUp}`);
    console.log(`Target Value of TokenB in USD Down: ${targetValueUSDDown}`);
    console.log(`Lamports to Sell: ${lamportsToSell}`);
    console.log(`Expected USDC for Sell: ${expectedUSDCForSell}`);
    console.log(`USDC Lamports for Sell ${expectedUSDCForSellLamports}`);
    console.log(`Lamports to Buy: ${lamportsToBuy}`);
    console.log(`Expected USDC for Buy: ${expectedUSDCForBuy}`);
    console.log(`USDC Lamports for Buy ${expectedUSDCForBuyLamports}\n`);
	*/
	
	await jitoController("infinity");
	console.log(
		"Pause for 5 seconds to allow orders to finalize on blockchain.",
		await delay(5000)
	);
	monitor();
}

async function createTx(inAmount, outAmount, inputMint, outputMint, base) {
	if (shutDown) return;

	const maxRetries = 5;
	const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

	let attempt = 0;
	while (attempt < maxRetries) {
		attempt++;
		try {
			const response = await fetch(
				"https://jup.ag/api/limit/v1/createOrder",
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						owner: payer.publicKey.toString(),
						inAmount,
						outAmount,
						inputMint: inputMint.toString(),
						outputMint: outputMint.toString(),
						expiredAt: null,
						base: base.publicKey.toString()
					})
				}
			);

			if (!response.ok) {
				throw new Error(
					`Failed to create order: ${response.statusText}`
				);
			}

			const responseData = await response.json();
			const { tx: encodedTransaction } = responseData;

			// Deserialize the raw transaction
			const transactionBuf = Buffer.from(encodedTransaction, "base64");
			const transaction = solanaWeb3.Transaction.from(transactionBuf);
			transaction.sign(payer, base);
			return {
				transaction,
				orderPubkey: responseData.orderPubkey
			};

			// to be handled later
			// return { txid, orderPubkey: responseData.orderPubkey};
		} catch (error) {
			await delay(2000);
		}
	}
	// If we get here, its proper broken...
	throw new Error("Order Creation failed after maximum attempts.");
}

async function cancelOrder(target = [], payer) {
	const retryCount = 10;
    for (let i = 0; i < retryCount; i++) {
		target = await checkOpenOrders();
		if (target.length === 0) {
			console.log("No orders to cancel.");
			return "skip";
		}
		console.log(target);
    	const requestData = {
        owner: payer.publicKey.toString(),
        feePayer: payer.publicKey.toString(),
        orders: Array.from(target)
    };
        try {
            const response = await fetch("https://jup.ag/api/limit/v1/cancelOrders", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(requestData)
            });

            if (!response.ok) {
                console.log("Bad Cancel Order Request");
                throw new Error(`HTTP error! Status: ${response.status}`);
            }

            const responseData = await response.json();
            const transactionBase64 = responseData.tx;
            const transactionBuf = Buffer.from(transactionBase64, "base64");
            const transaction = solanaWeb3.Transaction.from(transactionBuf);

            const { blockhash } = await connection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.sign(payer);
            return transaction;
        } catch (error) {
			await delay(2000);
            if (i === retryCount - 1) throw error; // If last retry, throw error
            console.log(`Attempt ${i + 1} failed. Retrying...`);

			target = await checkOpenOrders();
        }
    }
}

async function balanceCheck() {
	console.log("Checking Portfolio, we will rebalance if necessary.");
	const currentBalances = await getBalance(
	  payer,
	  selectedAddressA,
	  selectedAddressB,
	  selectedTokenA,
	  selectedTokenB
	);
  
	currBalanceA = currentBalances.balanceA;
	currBalanceB = currentBalances.balanceB;
	currUSDBalanceA = currentBalances.usdBalanceA;
	currUSDBalanceB = currentBalances.usdBalanceB;
	currUsdTotalBalance = currUSDBalanceA + currUSDBalanceB;
	tokenARebalanceValue = currentBalances.tokenARebalanceValue;
	tokenBRebalanceValue = currentBalances.tokenBRebalanceValue;
	let currBalanceALamports = currBalanceA * Math.pow(10, selectedDecimalsA);
	let currBalanceBLamports = currBalanceB * Math.pow(10, selectedDecimalsB);
	if (currUsdTotalBalance < infinityTarget) {
	  console.log(
		`Your total balance is not high enough for your Token B Target Value. Please either increase your wallet balance or reduce your target.`
	  );
	  process.exit(0);
	}
	const targetUsdBalancePerToken = infinityTarget;
	const percentageDifference = Math.abs(
	  (currUSDBalanceB - targetUsdBalancePerToken) / targetUsdBalancePerToken
	);
	if (percentageDifference > 0.03) {
	  if (currUSDBalanceB < targetUsdBalancePerToken) {
		const deficit =
		  (targetUsdBalancePerToken - currUSDBalanceB) *
		  Math.pow(10, selectedDecimalsA);
		adjustmentA = Math.floor(
		  Math.abs((-1 * deficit) / tokenARebalanceValue)
		);
	  } else if (currUSDBalanceB > targetUsdBalancePerToken) {
		const surplus =
		  (currUSDBalanceB - targetUsdBalancePerToken) *
		  Math.pow(10, selectedDecimalsB);
		adjustmentB = Math.floor(
		  Math.abs(-1 * (surplus / tokenBRebalanceValue))
		);
	  }
	} else {
	  console.log("Token B $ value within 3% of target, skipping rebalance.");
	  return "skip";
	}
	const rebalanceSlippageBPS = 200;
  
	const confirmTransaction = async () => {
		if (!askForRebalance) {
			return true;
		}
		const answer = await questionAsync('Do you want to proceed with this transaction? (Y/n) ');
		if (answer.toUpperCase() === 'N') {
		  console.log('Transaction cancelled by user. Closing program.');
		  process.exit(0);
		} else {
			askForRebalance = false;
		  return true;
		}
	  };
  
	if (adjustmentA > 0) {
		if (adjustmentA > currBalanceALamports) {
			console.log(adjustmentA);
			console.log(currBalanceALamports);
			console.log(
				`You do not have enough ${selectedTokenA} to rebalance. There has been an error.
Attempting to swap ${chalk.cyan(adjustmentA / Math.pow(10, selectedDecimalsA))} ${chalk.cyan(selectedTokenA)} to ${chalk.magenta(selectedTokenB)}`
			);
			process.exit(0);
		}
	  console.log(
		`Need to trade ${chalk.cyan(adjustmentA / Math.pow(10, selectedDecimalsA))} ${chalk.cyan(selectedTokenA)} to ${chalk.magenta(selectedTokenB)} to balance.`
	  );
	  const userConfirmation = await confirmTransaction();
	  if (userConfirmation) {
		const rebalanceTx = await rebalanceTokens(
		  selectedAddressA,
		  selectedAddressB,
		  adjustmentA,
		  rebalanceSlippageBPS,
		  quoteurl
		);
		return rebalanceTx;
	  } else {
		console.log('Transaction cancelled by user.');
		return;
	  }
	} else if (adjustmentB > 0) {
		if (adjustmentB > currBalanceBLamports) {
			console.log(adjustmentB);
			console.log(currBalanceBLamports);
			console.log(
				`You do not have enough ${selectedTokenB} to rebalance. There has been an error.
Attempting to swap ${chalk.magenta(adjustmentB / Math.pow(10, selectedDecimalsB))} ${chalk.magenta(selectedTokenB)} to ${chalk.cyan(selectedTokenA)}`
			);
			process.exit(0);
		}
	  console.log(
		`Need to trade ${chalk.magenta(adjustmentB / Math.pow(10, selectedDecimalsB))} ${chalk.magenta(selectedTokenB)} to ${chalk.cyan(selectedTokenA)} to balance.`
	  );
	  const userConfirmation = await confirmTransaction();
	  if (userConfirmation) {
		const rebalanceTx = await rebalanceTokens(
		  selectedAddressB,
		  selectedAddressA,
		  adjustmentB,
		  rebalanceSlippageBPS,
		  quoteurl
		);
		return rebalanceTx;
	  } else {
		console.log('Transaction cancelled by user.');
		return;
	  }
	}
}

async function rebalanceTokens(
	inputMint,
	outputMint,
	rebalanceValue,
	rebalanceSlippageBPS,
	quoteurl
) {
	if (shutDown) return;
	const rebalanceLamports = Math.floor(rebalanceValue);
	console.log(`Rebalancing Tokens ${chalk.cyan(selectedTokenA)} and ${chalk.magenta(selectedTokenB)}`);

	try {
		// Fetch the quote
		const quoteResponse = await axios.get(
			`${quoteurl}?inputMint=${inputMint}&outputMint=${outputMint}&amount=${rebalanceLamports}&autoSlippage=true&maxAutoSlippageBps=200` //slippageBps=${rebalanceSlippageBPS}
		);

		const swapApiResponse = await fetch(
			"https://quote-api.jup.ag/v6/swap",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json"
				},
				body: JSON.stringify({
					quoteResponse: quoteResponse.data,
					userPublicKey: payer.publicKey,
					wrapAndUnwrapSol: true
				})
			}
		);

		const { blockhash } = await connection.getLatestBlockhash();
		const swapData = await swapApiResponse.json();

		if (!swapData || !swapData.swapTransaction) {
			throw new Error("Swap transaction data not found.");
		}

		// Deserialize the transaction correctly for a versioned message
		const swapTransactionBuffer = Buffer.from(
			swapData.swapTransaction,
			"base64"
		);
		const transaction = VersionedTransaction.deserialize(
			swapTransactionBuffer
		);

		transaction.recentBlockhash = blockhash;
		transaction.sign([payer]);
		return transaction;
	} catch (error) {
		console.error("Error during the transaction:", error);
	}
}
//Main Loop/Display Functions
async function monitor() {
	if (shutDown) return;
	const maxRetries = 20;
	let retries = 0;
	await updateMainDisplay();
	while (retries < maxRetries) {
		try {
			await checkOpenOrders();
			await handleOrders(checkArray);
			break; // Break the loop if we've successfully handled the price monitoring
		} catch (error) {
			console.log(error);
			console.error(
				`Error: Connection or Token Data Error (Monitor Price) - (Attempt ${retries + 1} of ${maxRetries})`
			);
			retries++;

			if (retries === maxRetries) {
				console.error(
					"Maximum number of retries reached. Unable to retrieve data."
				);
				return null;
			}
		}
	}
}

async function updateMainDisplay() {
	console.clear();
	console.log(`Jupgrid v${packageInfo.version}`);
	console.log(`\u{267E}  Infinity Mode`);
	console.log(`\u{1F4B0} Wallet: ${displayAddress}`);
	formatElapsedTime(startTime);
	console.log(`-`);
	console.log(
	  `\u{1F527} Settings: ${chalk.cyan(selectedTokenA)}/${chalk.magenta(selectedTokenB)}\n\u{1F3AF} ${selectedTokenB} Target Value: $${infinityTarget}\n\u{1F6A8} Stop Loss at $${stopLossUSD}\n\u{2B65} Spread: ${spread}%\n\u{1F55A} Monitor Delay: ${monitorDelay}ms`
	);
	try {
	const { newUSDBalanceA, newUSDBalanceB } = await fetchNewUSDValues();
	currUSDBalanceA = newUSDBalanceA;
	currUSDBalanceB = newUSDBalanceB;
	currUsdTotalBalance = currUSDBalanceA + currUSDBalanceB; // Recalculate total
	newPrice = await updatePrice(selectedAddressB);
	} catch (error) {
	  // Error is not critical. Reuse the previous balances and try another update again next cycle.
	}

	if (currUsdTotalBalance < stopLossUSD) {
	  // Emergency Stop Loss
	  console.clear();
	  console.log(
		`\n\u{1F6A8} Emergency Stop Loss Triggered! - Cashing out and Exiting`
	  );
	  stopLoss = true;
	  process.kill(process.pid, "SIGINT");
	}

	let {multiplier, quantity} = await formatTokenPrice(newPrice);
	let adjustedNewPrice = newPrice * multiplier
	let adjustedNewPriceBUp = newPriceBUp * multiplier
	let adjustedNewPriceBDown = newPriceBDown * multiplier
	if(iteration === 0)
	{
			currentTracker = new Array(50).fill(adjustedNewPrice);
			sellPrice = new Array(50).fill(adjustedNewPriceBUp);
			buyPrice = new Array(50).fill(adjustedNewPriceBDown);
	}

	currentTracker.splice(0,0,(adjustedNewPrice).toString())
	currentTracker.pop();
	buyPrice.splice(0,0,(adjustedNewPriceBDown).toString())
	buyPrice.pop();
	sellPrice.splice(0,0,(adjustedNewPriceBUp).toString())
	sellPrice.pop();
	iteration++;
	var config = {
		height:20,
		colors:[
			asciichart.blue,
			asciichart.green,
			asciichart.yellow,
		]
	}
	console.log(`-
Starting Balance : $${initUsdTotalBalance.toFixed(2)}
Current Balance  : $${currUsdTotalBalance.toFixed(2)}`);
  
	const { profitOrLoss, percentageChange } = calculateProfitOrLoss(currUsdTotalBalance, initUsdTotalBalance);
	displayProfitOrLoss(profitOrLoss, percentageChange);
  
	console.log(`Market Change %: ${(((newPrice - startPrice) / startPrice) * 100).toFixed(2)}%
Market Change USD: ${(newPrice - startPrice).toFixed(9)}
Performance Delta: ${(percentageChange - ((newPrice - startPrice) / startPrice) * 100).toFixed(2)}%
-
Latest Snapshot Balance ${chalk.cyan(selectedTokenA)}: ${chalk.cyan(currBalanceA.toFixed(5))} (Change: ${chalk.cyan((currBalanceA - initBalanceA).toFixed(5))}) - Worth: $${currUSDBalanceA.toFixed(2)}
Latest Snapshot Balance ${chalk.magenta(selectedTokenB)}: ${chalk.magenta(currBalanceB.toFixed(5))} (Change: ${chalk.magenta((currBalanceB - initBalanceB).toFixed(5))}) - Worth: $${currUSDBalanceB.toFixed(2)}
-
Starting Balance A - ${chalk.cyan(selectedTokenA)}: ${chalk.cyan(initBalanceA.toFixed(5))}
Starting Balance B - ${chalk.magenta(selectedTokenB)}: ${chalk.magenta(initBalanceB.toFixed(5))}
-
Trades: ${counter}
Rebalances: ${rebalanceCounter}
-
Sell Order Price: ${newPriceBUp.toFixed(9)} - Selling ${chalk.magenta(Math.abs(infinitySellInputLamports / Math.pow(10, selectedDecimalsB)))} ${chalk.magenta(selectedTokenB)} for ${chalk.cyan(Math.abs(infinitySellOutputLamports / Math.pow(10, selectedDecimalsA)))} ${chalk.cyan(selectedTokenA)}
Current Price ${quantity}:`);
console.log(asciichart.plot([currentTracker,buyPrice,sellPrice],config));
console.log(`Buy Order Price: ${newPriceBDown.toFixed(9)} - Buying ${chalk.magenta(Math.abs(infinityBuyOutputLamports / Math.pow(10, selectedDecimalsB)))} ${chalk.magenta(selectedTokenB)} for ${chalk.cyan(Math.abs(infinityBuyInputLamports / Math.pow(10, selectedDecimalsA)))} ${chalk.cyan(selectedTokenA)}\n`);
}

async function checkOpenOrders() {
	openOrders = [];
	checkArray = [];

	// Make the JSON request
	openOrders = await limitOrder.getOrders([
		ownerFilter(payer.publicKey, "processed")
	]);

	// Create an array to hold publicKey values
	checkArray = openOrders.map((order) => order.publicKey.toString());
	return checkArray;
}

async function handleOrders(checkArray) {
	if (checkArray.length !== 2) {
		infinityGrid();
	} else {
		console.log("2 open orders. Waiting for change.");
		await delay(monitorDelay);
		await monitor();
	}
}

//End Function
process.on("SIGINT", () => {
	console.log("\nCTRL+C detected! Performing cleanup...");
	shutDown = true;
	(async () => {
		await jitoController("cancel");
		process.exit(0);
	})();
});
