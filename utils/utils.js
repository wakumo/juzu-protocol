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

exports.getAddress = function (pathFile) {
  pathFile = path.join(
    process.cwd(),
    'contract-addresses',
    network.name,
    pathFile,
  )

  return JSON.parse(fs.readFileSync(pathFile)).Token
}

exports.writeAddress = function (pathFile, address) {
  const dir = path.join(process.cwd(), 'contract-addresses', network.name)
  const addressesFile = path.join(dir, pathFile)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir)
  }
  fs.writeFileSync(
    addressesFile,
    JSON.stringify({ Token: address }, undefined, 2),
  )
}

exports.encodeParams = function (params) {
  return ethers.utils.defaultAbiCoder.encode(
    [
      'tuple(address collection, uint256 tokenId, uint256 amount, uint256 nftType)[] nfts',
      'tuple(address token, uint256 amount)[] assets',
    ],
    [params.nfts, params.assets],
  )
}

exports.encodeCondition = function (conditions) {
  return ethers.utils.defaultAbiCoder.encode(
    [
      'tuple(uint256 unlockAt, tuple(address token, uint256 amount, address receipt) externalFee, address releasableBy, uint256 groupPriority)[] conditions',
    ],
    [conditions],
  )
}

exports.stages = {
  open: 0,
  locked: 1,
  unlocked: 2,
}
