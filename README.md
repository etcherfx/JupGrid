<div align ="center">

<img src="projectInfo/icon.png" width="160">

# JupGrid

<span style="font-size:18px;">A Jupiter-based Limit Order GridBot</span>

</div>

## Projects Used 📁

- [ARBProtocol's jupgrid](https://github.com/ARBProtocol/jupgrid)

## Features ✨

- **Fully Decentralized Trading:** Operates on the [Jupiter Limit Order Book](https://jup.ag/limit/SOL-USDC), ensuring full control over your trading data and strategy.
- **Local Operation:** Runs on your own machine or a VPS, providing an additional layer of security and privacy.
- **Simple Grid Strategy:** Places one buy order and one sell order based on user-defined parameters, optimizing for market conditions, whilst being capital efficient.
- **Easy Setup:** Comes with a straightforward installation and setup process, including auto-creation of necessary user files.
- **User Prompted Parameters:** Dynamically prompts the user for trading parameters, allowing for flexible and responsive trading setups.

## Installation 🔧

- Clone the repository to your local machine:

  ```
  git clone https://github.com/etcherfx/JupGrid
  ```

- Navigate to the project directory:

  ```
  cd JupGrid
  ```

- Install the dependencies:

  ```
  npm i
  ```

## Initial Setup / Configuration 🚀

- Generate `.env` file:

  ```
  npm start
  ```

- Open the `.env` file in a text editor and input the following:

  - Your wallet private key
  - The URL to your RPC connection

- Encrypt the `.env` file:

  ```
  npm start
  ```

  > **Note:** This time you will be prompted to enter a password to locally encrypt your private key and RPC connection.

- Bot Configuration:

  ```
  npm start
  ```

  - After the bot has started, you will be prompted to enter the following parameters:

    | Parameter             | Description                                                                                                                           | Default  | Recommended          |
    | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------- |
    | Token A               | The stablecoin in the trading pair that maintains a consistent value, reducing risk in trading with more volatile assets.             | `USDC`   | `USDC`               |
    | Token B               | The more volatile asset in the trading pair whose price fluctuates and is the target for profit during market movements.              | `SOL`    | `N/A`                |
    | Infinity Target Value | The maximum USD value of Token B you wish to hold. Ensure this does not exceed the combined value of Token A and Token B.             | `N/A`    | $\frac{1}{2}(A + B)$ |
    | Spread                | The percentage difference between the market price and the order price.                                                               | `N/A`    | $\gt0.3%$            |
    | Stop Loss             | The price threshold of Token A and Token B combined at which the asset is automatically sold to limit potential losses.               | `N/A`    | `N/A`                |
    | Maximum Jito Tip      | The maximum amount of Jito you are willing to pay for the transaction in SOL.                                                         | `0.0002` | $\geq 0.00001%$      |
    | Delay                 | This helps prevent rate-limiting by the Jupiter API, as JupGrid is a 'slow' bot that doesn't need to update information every second. | `5000`   | $\geq 5000%$         |

  > **Note:** After configuration, JupGrid will place one buy order and one sell order based on the parameters you have set.

## Usage 📈

- After the bot has been configured, it will automatically start trading based on the parameters you have set. In the case that you stopped the bot, you can restart it by running:

  ```
  npm start
  ```

  > **Note:** There will also be a `userSettings.json` file created. This will contain data on the parameters you set during setup. You can modify bot parameters by editing this file directly.
