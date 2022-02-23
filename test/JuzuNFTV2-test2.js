const { expect, util } = require('chai')
const { BigNumber } = require('ethers')
const { network } = require('hardhat')
// const { ethers, network } = require('hardhat')
const utils = require('../utils/utils.js')

describe('Test Juzu', async function () {
  let juzuNFT, juzuFactory, JuzuFactory
  let data, params
  let YEAR_IN_SECONDS = 31557600
  let conditionsEncoded, paramsEncoded
  let apr = 365250
  let baseFeeAmount = utils.convertBig(10 ** 18).mul(100)
  let day = 60 * 60 * 24
  let month = day * 30
  before(async function () {
    ;[owner, buyer, recipient, recipient2, ...addrs] = await ethers.getSigners()

    const TestERC20 = await ethers.getContractFactory('TestERC20')
    testERC20 = await TestERC20.deploy()
    await testERC20.deployed()
    const JuzuERC20 = await ethers.getContractFactory('JuzuERC20')
    juzuERC20 = await JuzuERC20.deploy()
    await juzuERC20.deployed()
    await juzuERC20.mint(owner.address, utils.convertBig(10 ** 18).mul(1000000))

    const JuzuERC721 = await ethers.getContractFactory('JuzuERC721')
    juzuERC721 = await JuzuERC721.deploy()
    await juzuERC721.deployed()

    JuzuFactory = await ethers.getContractFactory('JuzuFactory')
    factoryVersion = 0
    juzuFactory = await JuzuFactory.deploy(
      juzuERC721.address,
      juzuERC20.address,
      factoryVersion,
      apr,
      baseFeeAmount,
    )
  })

  function baseStakingReward(value) {
    return BigNumber.from(value)
      .mul(month)
      .mul(data.apr)
      .div(10000)
      .div(100)
      .div(YEAR_IN_SECONDS)
  }

  function encodeParams(params) {
    return ethers.utils.defaultAbiCoder.encode(
      [
        'tuple(address collection, uint256 tokenId, uint256 amount, uint256 nftType)[] nfts',
        'tuple(address token, uint256 amount)[] assets',
      ],
      [params.nfts, params.assets],
    )
  }

  function encodeCondition(conditions) {
    return ethers.utils.defaultAbiCoder.encode(
      [
        'tuple(uint256 unlockAt, tuple(address token, uint256 amount, address receipt) externalFee, address releasableBy, uint256 groupPriority)[] conditions',
      ],
      [conditions],
    )
  }

  beforeEach(async function () {
    data = {
      nftTokenId: 1,
      nftTokenId2: 2,
      nftAmount: 1,
      nftType: 721,
      assetAmount: utils.convertBig(10 ** 18).mul(100),
      baseFeeAmount: baseFeeAmount,
      tokenBaseFee: juzuERC20.address,
      unlockAt: 7 * 60 * 60 * 2,
      currentTime: await testERC20.currentTime(),
      externalFeeReceipt: recipient.address,
      ethAmount: ethers.utils.parseEther('0.01'),
      apr: apr,
      stages: { open: 0, locked: 1, unclocked: 2 },
    }

    await juzuFactory.deployed()
    await juzuERC721.addJuzuFactory(juzuFactory.address)
    await juzuERC20.addMintRight(juzuFactory.address)

    const TestERC721 = await ethers.getContractFactory('TestERC721')
    testERC721 = await TestERC721.deploy()
    await testERC721.deployed()
    await testERC721.mint(owner.address, data.nftTokenId)
    await testERC20.mint(owner.address, data.assetAmount.mul(100))
    conditions = [
      {
        unlockAt: data.currentTime.add(data.unlockAt),
        externalFee: {
          token: testERC20.address,
          amount: data.assetAmount,
          receipt: data.externalFeeReceipt,
        },
        releasableBy: utils.address0,
        groupPriority: 0,
      },
    ]
    conditionsEncoded = encodeCondition(conditions)
    params = {
      nfts: [
        {
          collection: testERC721.address,
          tokenId: data.nftTokenId,
          amount: data.nftAmount,
          nftType: data.nftType,
        },
      ],
      assets: [
        {
          token: testERC20.address,
          amount: data.assetAmount,
        },
      ],
    }
    paramsEncoded = encodeParams(params)
  })

  afterEach(async function () {})

  describe('Juzu open stage with null condition at first', async () => {
    beforeEach(async () => {
      conditions = []
      conditionsEncoded = encodeCondition(conditions)
      tx = await juzuFactory.createJuzu(conditionsEncoded, data.stages.open)
      receipt = await tx.wait()
      args = receipt.events.filter((e) => {
        return e.event == 'JuzuLockerCreated'
      })[0].args
      tokenId = args.tokenId
      juzuLockerAddress = args.juzuLocker
      juzuLocker = await ethers.getContractAt('JuzuLocker', juzuLockerAddress)
      data.juzuTokenId = tokenId
    })

    it('update conditions', async () => {
      conditions = [
        {
          unlockAt: 0,
          externalFee: {
            token: juzuERC20.address,
            amount: data.assetAmount,
            receipt: data.externalFeeReceipt,
          },
          releasableBy: utils.address0,
          groupPriority: 0,
        },
        {
          unlockAt: 0,
          externalFee: {
            token: juzuERC20.address,
            amount: data.assetAmount,
            receipt: data.externalFeeReceipt,
          },
          releasableBy: recipient2.address,
          groupPriority: 1,
        },
      ]
      conditionsEncoded = encodeCondition(conditions)
      await juzuLocker.updateConditions(conditionsEncoded)
      result = await juzuLocker.getLockerInfo()
      expect(result.conditions[0][0].unlockAt).to.eq(0)
      expect(result.conditions[0][0].releasableBy).to.eq(utils.address0)
      expect(result.conditions[0][0].externalFee.token).to.eq(juzuERC20.address)
      expect(result.conditions[1][0].externalFee.token).to.eq(juzuERC20.address)
      expect(result.conditions[1][0].releasableBy).to.eq(recipient2.address)
    })
    it('owner still can release with condition nil', async () => {
      await juzuLocker.lock()

      await juzuERC20.approve(juzuLocker.address, data.baseFeeAmount)
      await juzuLocker.depositBaseFee(data.baseFeeAmount)

      groupIndex = 0
      conditionIndex = 0
      await juzuLocker.release(groupIndex, conditionIndex)
      expect(await juzuLocker.stage()).to.eq(data.stages.unclocked)
    })
  })
  //
  // Juzu at open stage
  //
  describe('Juzu open stage', async () => {
    beforeEach(async () => {
      tx = await juzuFactory.createJuzu(conditionsEncoded, data.stages.open)
      receipt = await tx.wait()
      args = receipt.events.filter((e) => {
        return e.event == 'JuzuLockerCreated'
      })[0].args
      tokenId = args.tokenId
      juzuLockerAddress = args.juzuLocker
      juzuLocker = await ethers.getContractAt('JuzuLocker', juzuLockerAddress)
      data.juzuTokenId = tokenId
    })

    it('change to lock stage success', async () => {
      await expect(juzuLocker.lock())
        .to.emit(juzuLocker, 'JuzuLocked')
        .withArgs(data.juzuTokenId)
    })
    it('add asset at Open stage success', async () => {
      await testERC721.approve(juzuLocker.address, data.nftTokenId)
      await testERC20.approve(juzuLocker.address, data.assetAmount)

      await expect(juzuLocker.addAssets(paramsEncoded, 0))
        .to.emit(juzuLocker, 'JuzuLockUpdated')
        .withArgs(owner.address, data.juzuTokenId)
    })
    it('open stage dont calculate staking reward', async () => {
      await juzuERC20.approve(juzuLocker.address, data.baseFeeAmount)
      await juzuLocker.depositBaseFee(data.baseFeeAmount)
      expect(await juzuLocker.depositedBaseFee()).to.eq(data.baseFeeAmount)

      currentTime = utils.convertInt(await testERC20.currentTime())

      await network.provider.send('evm_setNextBlockTimestamp', [
        currentTime + month,
      ])

      // add more juzu asset
      params.nfts = []
      params.assets = [
        {
          token: juzuERC20.address,
          amount: data.assetAmount,
        },
      ]
      await juzuERC20.approve(juzuLocker.address, data.assetAmount)
      paramsEncoded = encodeParams(params)
      await juzuLocker.addAssets(paramsEncoded, data.baseFeeAmount)
      await network.provider.send('evm_setNextBlockTimestamp', [
        currentTime + month * 2,
      ])
      // change to lock stage
      await juzuLocker.lock()
      expect(await juzuLocker.getStakingReward()).to.eq(0)
      await network.provider.send('evm_setNextBlockTimestamp', [
        currentTime + month * 3,
      ])
      // after transfer to lock, staking reward start
      stakingReward = baseStakingReward(
        data.baseFeeAmount.add(data.assetAmount),
      )
      await expect(juzuLocker.claim(owner.address))
        .to.emit(juzuLocker, 'JuzuClaimedStaking')
        .withArgs(stakingReward, owner.address)
    })
    it('cant burn at open stage', async () => {
      await expect(juzuLocker.burn()).to.be.revertedWith(
        'invalid_unlocked_stage',
      )
    })
    it('update conditions at open stage', async () => {
      conditions = [
        {
          unlockAt: 0,
          externalFee: {
            token: juzuERC20.address,
            amount: data.assetAmount,
            receipt: data.externalFeeReceipt,
          },
          releasableBy: utils.address0,
          groupPriority: 0,
        },
        {
          unlockAt: 0,
          externalFee: {
            token: juzuERC20.address,
            amount: data.assetAmount,
            receipt: data.externalFeeReceipt,
          },
          releasableBy: recipient2.address,
          groupPriority: 1,
        },
      ]
      conditionsEncoded = encodeCondition(conditions)
      await juzuLocker.updateConditions(conditionsEncoded)
      result = await juzuLocker.getLockerInfo()
      expect(result.conditions[0][0].unlockAt).to.eq(0)
      expect(result.conditions[0][0].releasableBy).to.eq(utils.address0)
      expect(result.conditions[0][0].externalFee.token).to.eq(juzuERC20.address)
      expect(result.conditions[1][0].externalFee.token).to.eq(juzuERC20.address)
      expect(result.conditions[1][0].releasableBy).to.eq(recipient2.address)
    })
    it('withdraw assets at open stage', async () => {
      params.assets.push({
        token: utils.eth_address,
        amount: data.ethAmount,
      })
      paramsEncoded = encodeParams(params)
      await testERC721.approve(juzuLocker.address, data.nftTokenId)
      await testERC20.approve(juzuLocker.address, data.assetAmount)

      await expect(
        juzuLocker.addAssets(paramsEncoded, 0, { value: data.ethAmount }),
      )
        .to.emit(juzuLocker, 'JuzuLockUpdated')
        .withArgs(owner.address, data.juzuTokenId)

      // withdraw nft #0
      nftIndex = 0
      await expect(
        juzuLocker.withdrawNFT(nftIndex, testERC721.address, data.nftTokenId),
      )
        .to.emit(juzuLocker, 'JuzuWithdrawNFT')
        .withArgs(data.juzuTokenId, testERC721.address, data.nftTokenId)
      expect(await testERC721.ownerOf(data.nftTokenId)).to.eq(owner.address)

      // withdraw testERC20 token
      assetIndex = 0
      ownerTestERC20Balance = await testERC20.balanceOf(owner.address)
      await expect(
        juzuLocker.withdrawAsset(
          assetIndex,
          testERC20.address,
          data.assetAmount,
        ),
      )
        .to.emit(juzuLocker, 'JuzuWithdrawAsset')
        .withArgs(data.juzuTokenId, testERC20.address, data.assetAmount)
      expect(await testERC20.balanceOf(owner.address)).to.eq(
        ownerTestERC20Balance.add(data.assetAmount),
      )

      // withdrawETH
      result = await juzuLocker.getLockerInfo()
      expect(await juzuLocker.provider.getBalance(juzuLocker.address)).to.eq(
        data.ethAmount,
      )
      await expect(
        juzuLocker.withdrawAsset(assetIndex, utils.eth_address, data.ethAmount),
      )
        .to.emit(juzuLocker, 'JuzuWithdrawAsset')
        .withArgs(data.juzuTokenId, utils.eth_address, data.ethAmount)
      expect(await juzuLocker.provider.getBalance(juzuLocker.address)).to.eq(0)
    })
    it('transfer owner success', async () => {
      await expect(
        juzuERC721.transferFrom(owner.address, buyer.address, data.juzuTokenId),
      )
        .to.emit(juzuERC721, 'Transfer')
        .withArgs(owner.address, buyer.address, data.juzuTokenId)
        .to.emit(juzuLocker, 'JuzuLockTransferedOwner')
        .withArgs(data.juzuTokenId, owner.address, buyer.address)
        .to.emit(juzuFactory, 'JuzuLockTransferedOwner')
        .withArgs(data.juzuTokenId, owner.address, buyer.address)
    })
    it('deposit extraFee at open stage', async () => {
      await testERC20.approve(juzuLocker.address, data.assetAmount)

      await juzuLocker.depositExtraFee(testERC20.address, data.assetAmount)
      expect(
        await juzuLocker.depositedExtraFeeAmounts(testERC20.address),
      ).to.eq(data.assetAmount)
    })
    it('cant release at open stage', async () => {
      await expect(juzuLocker.release(0, 0)).to.be.revertedWith(
        'invalid_locked_stage',
      )
    })
  })

  //
  // Update staking apr
  //
  describe('update staking apr', async () => {
    beforeEach(async () => {
      tx = await juzuFactory.createJuzu(conditionsEncoded, data.stages.open)
      receipt = await tx.wait()
      args = receipt.events.filter((e) => {
        return e.event == 'JuzuLockerCreated'
      })[0].args
      tokenId = args.tokenId
      juzuLockerAddress = args.juzuLocker
      juzuLocker = await ethers.getContractAt('JuzuLocker', juzuLockerAddress)
      data.juzuTokenId = tokenId
    })
    it('update staking apr at factory, apply new apr after claim at juzuLocker', async () => {
      await juzuERC20.approve(juzuLocker.address, data.baseFeeAmount)
      await juzuLocker.depositBaseFee(data.baseFeeAmount)
      expect(await juzuLocker.depositedBaseFee()).to.eq(data.baseFeeAmount)

      // add more juzu asset
      params.nfts = []
      params.assets = [
        {
          token: juzuERC20.address,
          amount: data.assetAmount,
        },
      ]
      await juzuERC20.approve(juzuLocker.address, data.assetAmount)
      paramsEncoded = encodeParams(params)
      await juzuLocker.addAssets(paramsEncoded, data.baseFeeAmount)

      // start calculate locking
      await juzuLocker.lock()
      currentTime = utils.convertInt(await testERC20.currentTime())
      expect(await juzuLocker.stage()).to.eq(data.stages.locked)
      expect(await juzuLocker.stakingApr()).to.eq(data.apr)
      stakingReward = baseStakingReward(
        data.baseFeeAmount.add(data.assetAmount),
      )
      data.apr = data.apr * 2
      // update staking apr on factory
      await juzuFactory.setApr(data.apr)

      // claim after one month
      await network.provider.send('evm_setNextBlockTimestamp', [
        currentTime + month,
      ])

      await expect(juzuLocker.claim(owner.address))
        .to.emit(juzuLocker, 'JuzuClaimedStaking')
        .withArgs(stakingReward, owner.address)

      // check new apr
      await network.provider.send('evm_setNextBlockTimestamp', [
        currentTime + month * 2,
      ])
      expect(await juzuLocker.stakingApr()).to.eq(data.apr)
      stakingReward = baseStakingReward(
        data.baseFeeAmount.add(data.assetAmount),
      )
      await expect(juzuLocker.claim(owner.address))
        .to.emit(juzuLocker, 'JuzuClaimedStaking')
        .withArgs(stakingReward, owner.address)
      await juzuFactory.setApr(data.apr / 2)
    })
  })

  //
  // Update Factory
  //
  describe('Update new Factory', async () => {
    // Pause old Factory
    beforeEach(async () => {
      tx = await juzuFactory.createJuzu(conditionsEncoded, data.stages.locked)
      receipt = await tx.wait()
      args = receipt.events.filter((e) => {
        return e.event == 'JuzuLockerCreated'
      })[0].args
      tokenId = args.tokenId
      juzuLockerAddress = args.juzuLocker
      juzuLocker = await ethers.getContractAt('JuzuLocker', juzuLockerAddress)
      data.juzuTokenId = tokenId
    })
    it('update new factory, old factory still can run', async () => {
      factoryVersion = 1
      juzuFactory2 = await JuzuFactory.deploy(
        juzuERC721.address,
        juzuERC20.address,
        factoryVersion,
        apr * 2,
        baseFeeAmount.mul(2),
      )
      await juzuFactory2.deployed()
      await juzuERC721.addJuzuFactory(juzuFactory2.address)
      await juzuERC20.addMintRight(juzuFactory2.address)

      // check create new offer from old factory
      tx = await juzuFactory.createJuzu(conditionsEncoded, data.stages.locked)
      receipt = await tx.wait()
      args = receipt.events.filter((e) => {
        return e.event == 'JuzuLockerCreated'
      })[0].args
      tokenId = args.tokenId
      juzuLockerAddress = args.juzuLocker
      juzuLocker = await ethers.getContractAt('JuzuLocker', juzuLockerAddress)
      data.juzuTokenId = tokenId

      await testERC721.approve(juzuLocker.address, data.nftTokenId)
      await testERC20.approve(juzuLocker.address, data.assetAmount)
      await juzuERC20.approve(juzuLocker.address, data.baseFeeAmount)
      await expect(juzuLocker.addAssets(paramsEncoded, data.baseFeeAmount))
        .to.emit(juzuLocker, 'JuzuLockUpdated')
        .withArgs(owner.address, data.juzuTokenId)
      expect(await juzuLocker.stakingApr()).to.eq(data.apr)
      expect(await juzuLocker.owner()).to.eq(owner.address)
      expect(await juzuLocker.tokenId()).to.eq(data.juzuTokenId)
      expect(await juzuLocker.depositedBaseFee()).to.eq(data.baseFeeAmount)
      expect(await juzuLocker.juzuFactory()).to.eq(juzuFactory.address)
      expect(await juzuLocker.juzuERC721()).to.eq(juzuERC721.address)
      expect(await juzuLocker.juzuERC20()).to.eq(juzuERC20.address)

      currentTime = utils.convertInt(await testERC20.currentTime())
      await juzuERC721.transferFrom(
        owner.address,
        buyer.address,
        data.juzuTokenId,
      )
      expect(await juzuLocker.owner()).to.eq(buyer.address)
      expect(await juzuERC721.ownerOf(data.juzuTokenId)).to.eq(buyer.address)
      await testERC20.approve(juzuLocker.address, data.assetAmount)
      await juzuLocker.depositExtraFee(testERC20.address, data.assetAmount)
      expect(
        await juzuLocker.depositedExtraFeeAmounts(testERC20.address),
      ).to.eq(data.assetAmount)
      month = 60 * 60 * 24 * 30
      await network.provider.send('evm_setNextBlockTimestamp', [
        currentTime + month,
      ])
      claimValue = data.baseFeeAmount
        .div(10000)
        .mul(data.apr)
        .div(100)
        .mul(month)
        .div(YEAR_IN_SECONDS)
      await expect(juzuLocker.connect(buyer).claim(buyer.address))
        .to.emit(juzuLocker, 'JuzuClaimedStaking')
        .withArgs(claimValue, buyer.address)
      await network.provider.send('evm_setNextBlockTimestamp', [
        currentTime + month * 2,
      ])
      groupIndex = 0
      conditionIndex = 0
      testERC20OwnerBalance = await testERC20.balanceOf(buyer.address)
      await expect(
        juzuLocker.connect(buyer).release(groupIndex, conditionIndex),
      )
        .to.emit(juzuLocker, 'JuzuLockReleased')
        .withArgs(
          data.juzuTokenId,
          groupIndex,
          conditionIndex,
          buyer.address,
          data.baseFeeAmount,
        )
        .to.emit(juzuFactory, 'JuzuBurnedBaseFee')
        .withArgs(data.juzuTokenId, data.baseFeeAmount)
      expect(await juzuLocker.releasedBy()).to.eq(buyer.address)
      expect(await testERC721.ownerOf(data.nftTokenId)).to.eq(buyer.address)
      expect(await testERC20.balanceOf(buyer.address)).to.eq(
        testERC20OwnerBalance.add(data.assetAmount),
      )
      expect(await juzuERC20.balanceOf(juzuLocker.address)).to.eq(0) // baseFee was burned

      juzuOwnerBalance = await juzuERC20.balanceOf(buyer.address)
      await expect(juzuLocker.connect(buyer).burn())
        .to.emit(juzuLocker, 'JuzuBurned')
        .withArgs(data.juzuTokenId)
        .to.emit(juzuLocker, 'JuzuClaimedStaking')
        .withArgs(claimValue, buyer.address)

      await expect(juzuERC721.ownerOf(data.juzuTokenId)).to.be.revertedWith(
        'nonexistent',
      )
      expect(await juzuERC20.balanceOf(buyer.address)).to.eq(
        juzuOwnerBalance.add(claimValue),
      )
    })
    it('update new factory, pause old factory, offer still can run but cant create new', async () => {
      factoryVersion = 1
      juzuFactory2 = await JuzuFactory.deploy(
        juzuERC721.address,
        juzuERC20.address,
        factoryVersion,
        apr * 2,
        baseFeeAmount.mul(2),
      )
      await juzuFactory2.deployed()
      await juzuERC721.addJuzuFactory(juzuFactory2.address)
      await juzuERC20.addMintRight(juzuFactory2.address)

      await juzuFactory.pause()
      // old order can run safely
      await testERC721.approve(juzuLocker.address, data.nftTokenId)
      await testERC20.approve(juzuLocker.address, data.assetAmount)
      await juzuERC20.approve(juzuLocker.address, data.baseFeeAmount)
      await expect(juzuLocker.addAssets(paramsEncoded, data.baseFeeAmount))
        .to.emit(juzuLocker, 'JuzuLockUpdated')
        .withArgs(owner.address, data.juzuTokenId)
      expect(await juzuLocker.stakingApr()).to.eq(data.apr)
      expect(await juzuLocker.owner()).to.eq(owner.address)
      expect(await juzuLocker.tokenId()).to.eq(data.juzuTokenId)
      expect(await juzuLocker.depositedBaseFee()).to.eq(data.baseFeeAmount)
      expect(await juzuLocker.juzuFactory()).to.eq(juzuFactory.address)
      expect(await juzuLocker.juzuERC721()).to.eq(juzuERC721.address)
      expect(await juzuLocker.juzuERC20()).to.eq(juzuERC20.address)

      currentTime = utils.convertInt(await testERC20.currentTime())
      await juzuERC721.transferFrom(
        owner.address,
        buyer.address,
        data.juzuTokenId,
      )
      expect(await juzuLocker.owner()).to.eq(buyer.address)
      expect(await juzuERC721.ownerOf(data.juzuTokenId)).to.eq(buyer.address)
      await testERC20.approve(juzuLocker.address, data.assetAmount)
      await juzuLocker.depositExtraFee(testERC20.address, data.assetAmount)
      expect(
        await juzuLocker.depositedExtraFeeAmounts(testERC20.address),
      ).to.eq(data.assetAmount)
      month = 60 * 60 * 24 * 30
      await network.provider.send('evm_setNextBlockTimestamp', [
        currentTime + month,
      ])
      claimValue = data.baseFeeAmount
        .div(10000)
        .mul(data.apr)
        .div(100)
        .mul(month)
        .div(YEAR_IN_SECONDS)
      await expect(juzuLocker.connect(buyer).claim(buyer.address))
        .to.emit(juzuLocker, 'JuzuClaimedStaking')
        .withArgs(claimValue, buyer.address)
      await network.provider.send('evm_setNextBlockTimestamp', [
        currentTime + month * 2,
      ])
      groupIndex = 0
      conditionIndex = 0
      testERC20OwnerBalance = await testERC20.balanceOf(buyer.address)
      await expect(
        juzuLocker.connect(buyer).release(groupIndex, conditionIndex),
      )
        .to.emit(juzuLocker, 'JuzuLockReleased')
        .withArgs(
          data.juzuTokenId,
          groupIndex,
          conditionIndex,
          buyer.address,
          data.baseFeeAmount,
        )
        .to.emit(juzuFactory, 'JuzuBurnedBaseFee')
        .withArgs(data.juzuTokenId, data.baseFeeAmount)
      expect(await juzuLocker.releasedBy()).to.eq(buyer.address)
      expect(await testERC721.ownerOf(data.nftTokenId)).to.eq(buyer.address)
      expect(await testERC20.balanceOf(buyer.address)).to.eq(
        testERC20OwnerBalance.add(data.assetAmount),
      )
      expect(await juzuERC20.balanceOf(juzuLocker.address)).to.eq(0) // baseFee was burned

      juzuOwnerBalance = await juzuERC20.balanceOf(buyer.address)
      await expect(juzuLocker.connect(buyer).burn())
        .to.emit(juzuLocker, 'JuzuBurned')
        .withArgs(data.juzuTokenId)
        .to.emit(juzuLocker, 'JuzuClaimedStaking')
        .withArgs(claimValue, buyer.address)

      await expect(juzuERC721.ownerOf(data.juzuTokenId)).to.be.revertedWith(
        'nonexistent',
      )
      expect(await juzuERC20.balanceOf(buyer.address)).to.eq(
        juzuOwnerBalance.add(claimValue),
      )

      // cant create new juzu
      await expect(
        juzuFactory.createJuzu(conditionsEncoded, data.stages.locked),
      ).to.be.revertedWith('Pausable: paused')

      // create new offer at factory 2 and it run normally
      params = {
        nfts: [
          {
            collection: testERC721.address,
            tokenId: data.nftTokenId2,
            amount: data.nftAmount,
            nftType: data.nftType,
          },
        ],
        assets: [
          {
            token: testERC20.address,
            amount: data.assetAmount,
          },
        ],
      }
      paramsEncoded = encodeParams(params)
      await testERC721.mint(owner.address, data.nftTokenId2)
      expect(await juzuFactory2.juzuERC721()).to.eq(juzuERC721.address)
      expect(await juzuFactory2.juzuERC20()).to.eq(juzuERC20.address)
      data.apr = data.apr * 2
      data.baseFeeAmount = data.baseFeeAmount.mul(2)
      tx = await juzuFactory2.createJuzu(conditionsEncoded, data.stages.locked)
      receipt = await tx.wait()
      args = receipt.events.filter((e) => {
        return e.event == 'JuzuLockerCreated'
      })[0].args
      tokenId = args.tokenId
      juzuLockerAddress = args.juzuLocker
      juzuLocker = await ethers.getContractAt('JuzuLocker', juzuLockerAddress)
      data.juzuTokenId = tokenId

      await testERC721.approve(juzuLocker.address, data.nftTokenId2)
      await testERC20.approve(juzuLocker.address, data.assetAmount)
      await juzuERC20.approve(juzuLocker.address, data.baseFeeAmount)
      await expect(juzuLocker.addAssets(paramsEncoded, data.baseFeeAmount))
        .to.emit(juzuLocker, 'JuzuLockUpdated')
        .withArgs(owner.address, data.juzuTokenId)
      expect(await juzuLocker.stakingApr()).to.eq(data.apr)
      expect(await juzuLocker.owner()).to.eq(owner.address)
      expect(await juzuLocker.tokenId()).to.eq(data.juzuTokenId)
      expect(await juzuLocker.depositedBaseFee()).to.eq(data.baseFeeAmount)
      expect(await juzuLocker.juzuFactory()).to.eq(juzuFactory2.address)
      expect(await juzuLocker.juzuERC721()).to.eq(juzuERC721.address)
      expect(await juzuLocker.juzuERC20()).to.eq(juzuERC20.address)

      currentTime = utils.convertInt(await testERC20.currentTime())
      await juzuERC721.transferFrom(
        owner.address,
        buyer.address,
        data.juzuTokenId,
      )
      expect(await juzuLocker.owner()).to.eq(buyer.address)
      expect(await juzuERC721.ownerOf(data.juzuTokenId)).to.eq(buyer.address)
      await testERC20.approve(juzuLocker.address, data.assetAmount)
      await juzuLocker.depositExtraFee(testERC20.address, data.assetAmount)
      expect(
        await juzuLocker.depositedExtraFeeAmounts(testERC20.address),
      ).to.eq(data.assetAmount)
      month = 60 * 60 * 24 * 30
      await network.provider.send('evm_setNextBlockTimestamp', [
        currentTime + month,
      ])
      claimValue = data.baseFeeAmount
        .div(10000)
        .mul(data.apr)
        .div(100)
        .mul(month)
        .div(YEAR_IN_SECONDS)
      await expect(juzuLocker.connect(buyer).claim(buyer.address))
        .to.emit(juzuLocker, 'JuzuClaimedStaking')
        .withArgs(claimValue, buyer.address)
      await network.provider.send('evm_setNextBlockTimestamp', [
        currentTime + month * 2,
      ])
      groupIndex = 0
      conditionIndex = 0
      testERC20OwnerBalance = await testERC20.balanceOf(buyer.address)
      await expect(
        juzuLocker.connect(buyer).release(groupIndex, conditionIndex),
      )
        .to.emit(juzuLocker, 'JuzuLockReleased')
        .withArgs(
          data.juzuTokenId,
          groupIndex,
          conditionIndex,
          buyer.address,
          data.baseFeeAmount,
        )
        .to.emit(juzuFactory2, 'JuzuBurnedBaseFee')
        .withArgs(data.juzuTokenId, data.baseFeeAmount)
      expect(await juzuLocker.releasedBy()).to.eq(buyer.address)
      expect(await testERC721.ownerOf(data.nftTokenId2)).to.eq(buyer.address)
      expect(await testERC20.balanceOf(buyer.address)).to.eq(
        testERC20OwnerBalance.add(data.assetAmount),
      )
      expect(await juzuERC20.balanceOf(juzuLocker.address)).to.eq(0) // baseFee was burned

      juzuOwnerBalance = await juzuERC20.balanceOf(buyer.address)
      await expect(juzuLocker.connect(buyer).burn())
        .to.emit(juzuLocker, 'JuzuBurned')
        .withArgs(data.juzuTokenId)
        .to.emit(juzuLocker, 'JuzuClaimedStaking')
        .withArgs(claimValue, buyer.address)

      await expect(juzuERC721.ownerOf(data.juzuTokenId)).to.be.revertedWith(
        'nonexistent',
      )
      expect(await juzuERC20.balanceOf(buyer.address)).to.eq(
        juzuOwnerBalance.add(claimValue),
      )
    })
  })
})
