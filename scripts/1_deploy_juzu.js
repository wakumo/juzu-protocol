const { ethers } = require('hardhat')
const fs = require('fs')
const path = require('path')
const { BigNumber } = require('ethers')
async function main() {
  ;[owner, buyer, ...addrs] = await ethers.getSigners()

  const JuzuERC20 = await ethers.getContractFactory('JuzuERC20')
  juzuERC20 = await JuzuERC20.deploy()
  await juzuERC20.deployed()
  writeDownContractAddress('juzuERC20.json', juzuERC20.address)
  await juzuERC20.mint(owner.address, BigNumber.from(10).pow(18).mul(100000000))

  const JuzuERC721 = await ethers.getContractFactory('JuzuERC721')
  juzuERC721 = await JuzuERC721.deploy()
  await juzuERC721.deployed()
  writeDownContractAddress('juzuERC721.json', juzuERC721.address)

  apr = 365250
  baseFeeAmount = (BigNumber.from(10).pow(18)).mul(100) // 100 JUZ
  const JuzuFactory = await ethers.getContractFactory('JuzuFactory')
  factoryVersion = 0
  juzuFactory = await JuzuFactory.deploy(
    juzuERC721.address,
    juzuERC20.address,
    factoryVersion,
    apr,
    baseFeeAmount,
  )
  await juzuFactory.deployed()
  writeDownContractAddress('juzuFactory.json', juzuFactory.address)

  // setup new juzuFactory
  await juzuERC721.addJuzuFactory(juzuFactory.address)
  await juzuERC20.addMintRight(juzuFactory.address)

  console.log("Deployed by: ", owner.address)
  console.log("JuzuERC20 address: ", juzuERC20.address)
  console.log("JuzuERC721 address: ", juzuERC721.address)
  console.log("JuzuFactory address: ", juzuFactory.address)
}

async function writeDownContractAddress(pathFile, address) {
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

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
