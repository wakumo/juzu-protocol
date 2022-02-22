const fs = require('fs')
const path = require('path')
const hre = require('hardhat')
const Web3 = require('web3')
const { network } = require('hardhat')
const ethers = hre.ethers

exports.convertInt = function (value) {
  return parseInt(value.toString())
}

exports.convertBig = function (value) {
  return ethers.BigNumber.from(BigInt(value).toString())
}

exports.address0 = '0x0000000000000000000000000000000000000000'
exports.eth_address = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'