<div align ="center">

<img src="projectInfo/icon.png" width="160">

# JupGrid

<span style="font-size:18px;">A Jupiter-based Limit Order GridBot</span>

</div>

## Features ✨

- **Fully Decentralized Trading:** Operates on the Jupiter Limit Order Book, ensuring full control over your trading data and strategy.
  [Jupiter Limit Order Book](https://jup.ag/limit/SOL-USDC)
- **Local Operation:** Runs on your own machine or a VPS, providing an additional layer of security and privacy.
- **Simple Grid Strategy:** Places one buy order and one sell order based on user-defined parameters, optimizing for market conditions, whilst being capital efficient.
- **Easy Setup:** Comes with a straightforward installation and setup process, including auto-creation of necessary user files.
- **User Prompted Parameters:** Dynamically prompts the user for trading parameters, allowing for flexible and responsive trading setups.

## Installation 🔧

- Clone the repository to your local machine:

  ```
  git clone https://github.com/etcherfx/jupgrid
  ```

- Install the dependencies:

  ```
  npm i
  ```

## Usage 🚀

- **Initial Setup:** Run JupGrid for the first time to create the necessary user configuration files:

  ```
  npm start
  ```

  This will generate a `.env` file where you will fill in your secure data.

- **Configuration:** Open the `.env` file in a text editor and input your Phantom wallet Private Key, and the URL to your RPC.

- **Encryption:** Start JupGrid with `npm start` again. This time you will be prompted to enter a password to locally encrypt your private key and RPC connection.

3. **Start JupGrid!** Start JupGrid a 3rd time with `npm start` and this time you will be prompted to enter the password you entered previously. You will then be show the start-up prompts, which allow you to modify the following parameters:
   - Token A:
   - Token B:
   - Infinity Target Value: (Maximum $ value of Token B you want to hold - Dont set this higher than your TokenA+B value!)
   - Spread (% difference from current market price to orders):
   - Stop Loss ($ value for BOTH Token A and Token B - If your wallet hits this value, the script will stop for safety)
   - Delay (This is used to stop you getting rate-limited by Jupiter API. JupGrid is a "slow" bot, and thus doesnt need information every second).

JupGrid will then place one buy and one sell order based on the parameters you have set.

## Configuration ⚙️

The `.env` file will need to contain your Phantom Wallet Private Key and URL to your RPC connection. Ensure you fill it out before running the bot for the second time:

- `RPC_URL`=YourRPCURLHere
- `PRIVATE_KEY`=YourPrivateKeyHere

Once these are encrypted, they are no longer human-readable. Please ensure you have other copies of this information saved elsewhere.

There will also be a `userSettings.json` file created. This will contain data on the parameters you set during setup. You can modify these parameters by editing this file directly.
