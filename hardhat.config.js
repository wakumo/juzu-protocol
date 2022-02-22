require('@nomiclabs/hardhat-waffle')
require('@nomiclabs/hardhat-ethers')
require('@nomiclabs/hardhat-web3')
require('dotenv').config()
require('@openzeppelin/hardhat-upgrades')
require('hardhat-gas-reporter')
// require('solidity-coverage')

const accounts = {
	mnemonic:
		process.env.MNEMONIC ||
		"test test test test test test test test test test test junk",
	// accountsBalance: "990000000000000000000",
};

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async () => {
	const accounts = await ethers.getSigners();

	for (const account of accounts) {
		console.log(account.address);
	}
});

require("@nomiclabs/hardhat-ethers");
require("@nomiclabs/hardhat-etherscan");

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
	solidity: {
		version: "0.8.9",
		settings: {
			optimizer: {
				enabled: true,
				runs: 200,
			},
		},
	},
	gasReporter: {
		currency: "usd",
		gasPrice: 5,
		showTimeSpent: true,
		coinmarketcap: process.env.CMC_API_KEY,
		excludeContracts: [
			"TestERC20.sol",
			"TestERC721.sol",
			"TestERC1155.sol",
			"ERC20.sol",
			"ERC1155.sol",
			"ERC721.sol",
		],
	},
	networks: {
		localhost: {
			url: "http://127.0.0.1:8545",
		},
		arbitrum: {
			url: "https://rinkeby.arbitrum.io/rpc",
			gasPrice: 20000000000,
			accounts,
		},
		rinkeby: {
			url: process.env.RINKEBY_HTTP_URL,
			accounts,
			gas: 30000000,
			gasPrice: 20000000000,
		},
		main: {
			url: "https://main-light.eth.linkpool.io",
			accounts,
		},
		hardhat: {
			// See its defaults
		},
	},
	etherscan: {
		apiKey: {
			mainnet: process.env.ETHERSCAN_MAINNET_API_KEY,
			bsc: process.env.ETHERSCAN_BSC_API,
			bscTestnet: process.env.ETHERSCAN_BSC_API,
		},
	},
	paths: {
		sources: "./contracts",
		tests: "./test",
		cache: "./cache",
		artifacts: "./artifacts",
	},
	mocha: {
		timeout: 20000,
	},
};
