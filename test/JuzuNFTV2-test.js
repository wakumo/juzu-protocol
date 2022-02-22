const { expect, util } = require('chai')
const { BigNumber } = require('ethers')
// const { ethers, network } = require('hardhat')
const utils = require('../utils/utils.js')

describe('Test Juzu', async function () {
  let juzuNFT, juzuFactory
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

    const JuzuFactory = await ethers.getContractFactory('JuzuFactory')
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
      .mul(apr)
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
      juzuERC20Id: 1,
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
      stages: { open: 0, locked: 1, unclocked: 2}
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

  //
  // CREATE
  //
  describe('Create locker', async () => {
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
    it('create success and add new data lock success', async () => {
      await testERC721.approve(juzuLocker.address, data.nftTokenId)
      await testERC20.approve(juzuLocker.address, data.assetAmount)
      // await juzuERC20.approve(juzuLocker.address, data.baseFeeAmount)
      await expect(juzuLocker.addAssets(paramsEncoded))
        .to.emit(juzuLocker, 'JuzuLockUpdated')
        .withArgs(owner.address, data.juzuTokenId)
    })

    it('create success and add new eth in lock data', async () => {
      params.assets.push({
        token: utils.eth_address,
        amount: data.ethAmount,
      })
      paramsEncoded = encodeParams(params)
      await testERC721.approve(juzuLocker.address, data.nftTokenId)
      await testERC20.approve(juzuLocker.address, data.assetAmount)

      await expect(
        juzuLocker.addAssets(paramsEncoded, { value: data.ethAmount }),
      )
        .to.emit(juzuLocker, 'JuzuLockUpdated')
        .withArgs(owner.address, data.juzuTokenId)
      asset = await juzuLocker.assets(1)
      expect(asset.token).to.eq(utils.eth_address)
      expect(asset.amount).to.eq(data.ethAmount)
      expect(await testERC721.ownerOf(data.nftTokenId)).to.eq(
        juzuLocker.address,
      )
      expect(await testERC20.balanceOf(juzuLocker.address)).to.eq(
        data.assetAmount,
      )
      expect(await juzuLocker.provider.getBalance(juzuLocker.address)).to.eq(
        data.ethAmount,
      )
    })

    it('fail to create without sneding eth if want to lock eth', async () => {
      params.assets.push({
        token: utils.eth_address,
        amount: data.ethAmount,
      })
      paramsEncoded = encodeParams(params)
      await testERC721.approve(juzuLocker.address, data.nftTokenId)
      await testERC20.approve(juzuLocker.address, data.assetAmount)

      await expect(juzuLocker.addAssets(paramsEncoded)).to.be.revertedWith('invalid_amount')
    })

    it('fail to create offer without approve token erc20', async () => {
      await testERC721.approve(juzuLocker.address, data.nftTokenId)
      await expect(juzuLocker.addAssets(paramsEncoded)).to.be.revertedWith('allowance')
    })
    it('fail to create offer without approve nft', async () => {
      await testERC20.approve(juzuLocker.address, data.assetAmount)
      await expect(juzuLocker.addAssets(paramsEncoded)).to.be.revertedWith('transfer caller is not owner nor approved')
    })
  })

  //
  // Transfer Owner
  //
  describe('transfer owner', async () => {
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
      await testERC721.approve(juzuLocker.address, data.nftTokenId)
      await testERC20.approve(juzuLocker.address, data.assetAmount)
      // await juzuERC20.approve(juzuLocker.address, data.baseFeeAmount)
      await juzuLocker.addAssets(paramsEncoded)
    })

    it('transfer owner success', async () => {
      await expect(
        juzuERC721.transferFrom(owner.address, buyer.address, data.juzuTokenId),
      )
        .to.emit(juzuERC721, 'Transfer')
        .withArgs(owner.address, buyer.address, data.juzuTokenId)
        .to.emit(juzuLocker, 'JuzuLockTransferedOwner')
        .withArgs(data.juzuTokenId, owner.address, buyer.address)
      expect(await juzuERC721.ownerOf(data.juzuTokenId)).to.eq(buyer.address)
      expect(await juzuLocker.owner()).to.eq(buyer.address)
    })

    it('fail transfer owner if wrong owner is caller + not approve', async () => {
      await expect(juzuERC721
        .connect(buyer)
        .transferFrom(owner.address, buyer.address, data.juzuTokenId))
        .to.be.revertedWith('transfer caller is not owner nor approved')
    })
    it('transfer success with approve function', async () => {
      await juzuERC721.approve(buyer.address, data.juzuTokenId)
      await expect(
        juzuERC721
          .connect(buyer)
          .transferFrom(owner.address, buyer.address, data.juzuTokenId),
      )
        .to.emit(juzuERC721, 'Transfer')
        .withArgs(owner.address, buyer.address, data.juzuTokenId)
        .to.emit(juzuLocker, 'JuzuLockTransferedOwner')
        .withArgs(data.juzuTokenId, owner.address, buyer.address)

      expect(await juzuERC721.ownerOf(data.juzuTokenId)).to.eq(buyer.address)
      expect(await juzuLocker.owner()).to.eq(buyer.address)
    })
  })

  //
  // Deposit fee: extra Fee + baseFee
  //
  describe('deposit fee', async () => {
    beforeEach(async () => {
      conditions.push({
        unlockAt: 0,
        externalFee: {
          token: utils.eth_address,
          amount: data.ethAmount,
          receipt: data.externalFeeReceipt,
        },
        releasableBy: utils.address0,
        groupPriority: 1,
      })
      conditionsEncoded = encodeCondition(conditions)
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
    it('deposit extra fee success', async () => {
      await testERC20.approve(juzuLocker.address, data.assetAmount)

      await expect(juzuLocker.depositExtraFee(testERC20.address, data.assetAmount))
        .to.emit(juzuLocker, 'JuzuLockDeposited')
        .withArgs(data.juzuTokenId, testERC20.address, data.assetAmount)
      expect(
        await juzuLocker.depositedExtraFeeAmounts(testERC20.address),
      ).to.eq(data.assetAmount)
    })
    it('deposit extra fee multiple time and eth', async () => {
      firstDeposit = data.assetAmount.sub(100)
      await testERC20.approve(juzuLocker.address, firstDeposit)
      await expect(juzuLocker.depositExtraFee(testERC20.address, firstDeposit))
        .to.emit(juzuLocker, 'JuzuLockDeposited')
        .withArgs(data.juzuTokenId, testERC20.address, firstDeposit)
      expect(
        await juzuLocker.depositedExtraFeeAmounts(testERC20.address),
      ).to.eq(firstDeposit)

      secondDeposit = 100
      await testERC20.approve(juzuLocker.address, secondDeposit)
      await expect(juzuLocker.depositExtraFee(testERC20.address, secondDeposit))
        .to.emit(juzuLocker, 'JuzuLockDeposited')
        .withArgs(data.juzuTokenId, testERC20.address, secondDeposit)
      expect(
        await juzuLocker.depositedExtraFeeAmounts(testERC20.address),
      ).to.eq(firstDeposit.add(secondDeposit))
    })

    it('deposit extra fee is eth', async () => {
      await expect(
        juzuLocker.depositExtraFee(utils.eth_address, data.ethAmount, {
          value: data.ethAmount,
        }),
      )
        .to.emit(juzuLocker, 'JuzuLockDeposited')
        .withArgs(data.juzuTokenId, utils.eth_address, data.ethAmount)

      expect(await juzuLocker.provider.getBalance(juzuLocker.address)).to.eq(
        data.ethAmount,
      )
    })

    it('deposit base fee multiple time', async () => {
      firstDeposit = data.baseFeeAmount.sub(100)
      await juzuERC20.approve(juzuLocker.address, firstDeposit)
      await expect(juzuLocker.depositBaseFee(firstDeposit))
        .to.emit(juzuLocker, 'JuzuLockDeposited')
        .withArgs(data.juzuTokenId, juzuERC20.address, firstDeposit)
      secondDeposit = 100
      await juzuERC20.approve(juzuLocker.address, secondDeposit)
      await expect(juzuLocker.depositBaseFee(secondDeposit))
        .to.emit(juzuLocker, 'JuzuLockDeposited')
        .withArgs(data.juzuTokenId, juzuERC20.address, secondDeposit)
      expect(await juzuERC20.balanceOf(juzuLocker.address)).to.eq(
        firstDeposit.add(secondDeposit),
      )
    })
  })

  //
  // ClaimStaking
  //
  describe('claim stacking', async () => {
    beforeEach(async () => {
      conditions.push({
        unlockAt: 0,
        externalFee: {
          token: juzuERC20.address,
          amount: data.assetAmount,
          receipt: data.externalFeeReceipt,
        },
        releasableBy: utils.address0,
        groupPriority: 1,
      })
      conditionsEncoded = encodeCondition(conditions)
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

    it('staking from baseFee', async () => {
      await juzuERC20.approve(juzuLocker.address, data.baseFeeAmount)
      await juzuLocker.depositBaseFee(data.baseFeeAmount)
      currentTime = utils.convertInt(await testERC20.currentTime())
      stakingReward = baseStakingReward(data.baseFeeAmount)
      await network.provider.send('evm_setNextBlockTimestamp', [
        currentTime + month,
      ])
      ownerJuzuBalance = await juzuERC20.balanceOf(owner.address)
      await expect(juzuLocker.claim(owner.address))
        .to.emit(juzuLocker, 'JuzuClaimedStaking')
        .withArgs(stakingReward, owner.address)
      expect(await juzuERC20.balanceOf(owner.address)).to.eq(
        ownerJuzuBalance.add(stakingReward),
      )
      expect(await juzuLocker.claimedAmount()).to.eq(stakingReward)
      expect(await juzuLocker.lastClaimedAt()).to.eq(currentTime + month)
      expect(await juzuLocker.lastRewardAmount()).to.eq(0)
    })

    it('claim after deposit more locked data', async () => {
      await juzuERC20.approve(juzuLocker.address, data.baseFeeAmount)
      await juzuLocker.depositBaseFee(data.baseFeeAmount)
      currentTime = utils.convertInt(await testERC20.currentTime())

      params.assets.push({
        token: juzuERC20.address,
        amount: data.assetAmount,
      })
      paramsEncoded = encodeParams(params)
      await testERC721.approve(juzuLocker.address, data.nftTokenId)
      await testERC20.approve(juzuLocker.address, data.assetAmount)
      await juzuERC20.approve(juzuLocker.address, data.assetAmount)

      await network.provider.send('evm_setNextBlockTimestamp', [
        currentTime + month,
      ])

      // add locked data after staking baseFee 1 month
      await juzuLocker.addAssets(paramsEncoded)

      // total reward is:
      // 2 month of baseFee staking + 1 month juzu locked
      stakingReward = baseStakingReward(data.baseFeeAmount).mul(2)
      stakingReward2 = baseStakingReward(data.assetAmount)
      await network.provider.send('evm_setNextBlockTimestamp', [
        currentTime + month * 2,
      ])
      ownerJuzuBalance = await juzuERC20.balanceOf(owner.address)
      await expect(juzuLocker.claim(owner.address))
        .to.emit(juzuLocker, 'JuzuClaimedStaking')
        .withArgs(stakingReward.add(stakingReward2), owner.address)
      expect(await juzuERC20.balanceOf(owner.address)).to.eq(
        ownerJuzuBalance.add(stakingReward).add(stakingReward2),
      )
    })
    it('claim multiple time', async () => {
      await juzuERC20.approve(juzuLocker.address, data.baseFeeAmount)
      await juzuLocker.depositBaseFee(data.baseFeeAmount)
      currentTime = utils.convertInt(await testERC20.currentTime())
      await network.provider.send('evm_setNextBlockTimestamp', [
        currentTime + month,
      ])
      stakingReward = baseStakingReward(data.baseFeeAmount)
      await expect(juzuLocker.claim(owner.address))
        .to.emit(juzuLocker, 'JuzuClaimedStaking')
        .withArgs(stakingReward, owner.address)

      // after more 1month deposit more juzuExtraFeeCondition
      await juzuERC20.approve(juzuLocker.address, data.assetAmount)
      await network.provider.send('evm_setNextBlockTimestamp', [
        currentTime + month * 2,
      ])
      await juzuLocker.depositExtraFee(juzuERC20.address, data.assetAmount)

      // after more 1 month deposit more Juzu inside lockData
      params = {
        assets: [
          {
            token: juzuERC20.address,
            amount: data.assetAmount,
          },
        ],
        nfts: [],
      }
      paramsEncoded = encodeParams(params)
      await juzuERC20.approve(juzuLocker.address, data.assetAmount)
      await network.provider.send('evm_setNextBlockTimestamp', [
        currentTime + month * 3,
      ])
      await juzuLocker.addAssets(paramsEncoded)

      // After more 1 month: total staking reward now are:
      // 3 month baseFee
      // 2 month extraFee
      // 1 month lockedData

      stakingReward = baseStakingReward(data.baseFeeAmount).mul(3)
      stakingReward2 = baseStakingReward(data.assetAmount).mul(2)
      stakingReward3 = baseStakingReward(data.assetAmount)

      await network.provider.send('evm_setNextBlockTimestamp', [
        currentTime + month * 4,
      ])
      await expect(juzuLocker.claim(owner.address))
        .to.emit(juzuLocker, 'JuzuClaimedStaking')
        .withArgs(
          stakingReward.add(stakingReward2).add(stakingReward3),
          owner.address,
        )
    })

    it('staking reward wont increase after releasing', async () => {
      await testERC721.approve(juzuLocker.address, data.nftTokenId)
      await testERC20.approve(juzuLocker.address, data.assetAmount)
      await juzuERC20.approve(juzuLocker.address, data.baseFeeAmount)

      await juzuLocker.addAssets(paramsEncoded)

      currentTime = utils.convertInt(await testERC20.currentTime())
      // solve extraFee condition
      await testERC20.approve(juzuLocker.address, data.assetAmount)
      await juzuLocker.depositExtraFee(testERC20.address, data.assetAmount)

      // release after 1 month
      await network.provider.send('evm_setNextBlockTimestamp', [
        currentTime + month,
      ])

      conditionIndex = 0
      groupIndex = 0
      await expect(juzuLocker.release(groupIndex, conditionIndex))
        .to.emit(juzuLocker, 'JuzuLockReleased')
        .withArgs(data.juzuTokenId, groupIndex, conditionIndex, owner.address, data.baseFeeAmount)

      stakingReward = baseStakingReward(data.baseFeeAmount)

      // after one month, claim, staking reward wont change
      await network.provider.send('evm_setNextBlockTimestamp', [
        currentTime + month * 2,
      ])
      await expect(juzuLocker.claim(owner.address))
        .to.emit(juzuLocker, 'JuzuClaimedStaking')
        .withArgs(stakingReward, owner.address)
    })
  })

  //
  // Check condition & release
  //
  describe('Check condition & release Juzu', async () => {
    beforeEach(async () => {
      conditions.push(
        {
          unlockAt: 0,
          externalFee: {
            token: utils.eth_address,
            amount: data.ethAmount,
            receipt: data.externalFeeReceipt,
          },
          releasableBy: utils.address0,
          groupPriority: 1,
        },
        {
          unlockAt: 0,
          externalFee: {
            token: testERC20.address,
            amount: data.assetAmount.mul(5),
            receipt: data.externalFeeReceipt,
          },
          releasableBy: utils.address0,
          groupPriority: 2,
        },
        {
          unlockAt: 0,
          externalFee: {
            token: utils.address0,
            amount: 0,
            receipt: utils.address0,
          },
          releasableBy: recipient2.address,
          groupPriority: 0,
        },
        {
          unlockAt: 0,
          externalFee: {
            token: utils.eth_address,
            amount: data.ethAmount,
            receipt: data.externalFeeReceipt,
          },
          releasableBy: utils.address0,
          groupPriority: 0,
        },
      )
      conditionsEncoded = encodeCondition(conditions)
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

      await juzuLocker.addAssets(paramsEncoded)
    })

    it('Check condition & release success by current owner', async () => {
      //solve extra fee conditioni
      await testERC20.approve(juzuLocker.address, data.assetAmount)
      await juzuLocker.depositExtraFee(testERC20.address, data.assetAmount)

      currentTime = utils.convertInt(await testERC20.currentTime())
      // solve time lock condition
      await network.provider.send('evm_setNextBlockTimestamp', [
        currentTime + data.unlockAt,
      ])

      ownerTestERC20Balance = await testERC20.balanceOf(owner.address)

      conditionIndex = 0
      groupIndex = 0
      await expect(juzuLocker.release(groupIndex, conditionIndex))
        .to.emit(juzuLocker, 'JuzuLockReleased')
        .withArgs(data.juzuTokenId, groupIndex, conditionIndex, owner.address, data.baseFeeAmount)

      expect(await testERC721.ownerOf(data.nftTokenId)).to.eq(owner.address)
      expect(await testERC20.balanceOf(owner.address)).to.eq(
        ownerTestERC20Balance.add(data.assetAmount),
      )
      expect(await juzuERC20.balanceOf(juzuLocker.address)).to.eq(0)
    })

    it('Check condition & release success, the rest token which is rejected will be transfer to releaser', async () => {
      await testERC20.approve(juzuLocker.address, data.assetAmount.mul(5))

      await juzuLocker.depositExtraFee(testERC20.address, data.assetAmount.mul(5))
      await juzuLocker.depositExtraFee(utils.eth_address, data.ethAmount.sub(100), {
        value: data.ethAmount.sub(100),
      })

      expect(
        await juzuLocker.depositedExtraFeeAmounts(testERC20.address),
      ).to.eq(data.assetAmount.mul(5))
      expect(
        await juzuLocker.depositedExtraFeeAmounts(utils.eth_address),
      ).to.eq(data.ethAmount.sub(100))

      // solve unlockAt
      await network.provider.send('evm_increaseTime', [data.unlockAt + 50])

      ownerBalance = await testERC20.balanceOf(owner.address)
      externalFeeReceiptBalance = await testERC20.balanceOf(
        data.externalFeeReceipt,
      )

      // offer will meet the first condition, eth will be inside JuzuLock, need to be transfered to owner
      // the testERC20 in 3rd conditions will be transferd to owner too
      ownerERC20Balance = await testERC20.balanceOf(owner.address)
      conditionIndex = 0
      groupIndex = 0
      expect((tx = await juzuLocker.release(groupIndex, conditionIndex)))
        .to.emit(juzuLocker, 'JuzuLockReleased')
        .withArgs(data.juzuTokenId, groupIndex, conditionIndex, owner.address, data.baseFeeAmount)
        .to.emit(juzuLocker, 'JuzuLockWithdrawed')
        .withArgs(utils.eth_address, owner.address, data.ethAmount.sub(100))
        .to.emit(juzuLocker, 'JuzuLockWithdrawed')
        .withArgs(testERC20.address, owner.address, data.assetAmount.mul(4))

      expect(await ethers.provider.getBalance(juzuLocker.address)).to.eq(0)
      expect(await testERC20.balanceOf(owner.address)).to.eq(
        ownerERC20Balance.add(data.assetAmount.mul(5)),
      )
      expect(await testERC721.ownerOf(data.nftTokenId)).to.eq(owner.address)
      expect(await testERC20.balanceOf(data.externalFeeReceipt)).to.eq(
        externalFeeReceiptBalance.add(data.assetAmount),
      )
    })

    it('releaser is different from owner', async () => {
      await testERC20.approve(juzuLocker.address, data.assetAmount.mul(5))

      await juzuLocker.depositExtraFee(testERC20.address, data.assetAmount.mul(5))
      await juzuLocker.depositExtraFee(utils.eth_address, data.ethAmount.sub(100), {
        value: data.ethAmount.sub(100),
      })
      // release by, group#0, condition #1: recipient2
      groupIndex = 0
      conditionIndex = 1
      recipient2ERC20Balance = await testERC20.balanceOf(recipient2.address)
      externalFeeReceiptBalance = await testERC20.balanceOf(
        data.externalFeeReceipt,
      )
      expect(
        (tx = await juzuLocker
          .connect(recipient2)
          .release(groupIndex, conditionIndex)),
      )
        .to.emit(juzuLocker, 'JuzuLockReleased')
        .withArgs(data.juzuTokenId, groupIndex, conditionIndex, recipient2.address, data.baseFeeAmount)
        .to.emit(juzuLocker, 'JuzuLockWithdrawed')
        .withArgs(
          utils.eth_address,
          recipient2.address,
          data.ethAmount.sub(100),
        )
        .to.emit(juzuLocker, 'JuzuLockWithdrawed')
        .withArgs(
          testERC20.address,
          recipient2.address,
          data.assetAmount.mul(5),
        )

      expect(await ethers.provider.getBalance(juzuLocker.address)).to.eq(0)
      expect(await testERC20.balanceOf(recipient2.address)).to.eq(
        recipient2ERC20Balance.add(data.assetAmount.mul(6)),
      )
      expect(await testERC721.ownerOf(data.nftTokenId)).to.eq(
        recipient2.address,
      )
      expect(await testERC20.balanceOf(data.externalFeeReceipt)).to.eq(
        externalFeeReceiptBalance,
      )
    })

    it('approve token and release in 1 action', async () => {
      // solve time lock
      await network.provider.send('evm_increaseTime', [data.unlockAt + 50])
      // release condition: group#0, index#0
      await testERC20.approve(juzuLocker.address, data.assetAmount)
      groupIndex = 0
      conditionIndex = 0
      await expect(juzuLocker.release(groupIndex, conditionIndex))
        .to.emit(juzuLocker, 'JuzuLockReleased')
        .withArgs(data.juzuTokenId, groupIndex, conditionIndex, owner.address, data.baseFeeAmount)
        .to.emit(juzuLocker, 'JuzuLockWithdrawed')
        .withArgs(testERC20.address, data.externalFeeReceipt, data.assetAmount)
    })

    it('send eth and release in 1 action', async () => {
      // release condition: group#0, index#2
      groupIndex = 0
      conditionIndex = 2

      await expect(
        juzuLocker.release(groupIndex, conditionIndex, {
          value: data.ethAmount,
        }),
      )
        .to.emit(juzuLocker, 'JuzuLockReleased')
        .withArgs(data.juzuTokenId, groupIndex, conditionIndex, owner.address, data.baseFeeAmount)
        .to.emit(juzuLocker, 'JuzuLockWithdrawed')
        .withArgs(utils.eth_address, data.externalFeeReceipt, data.ethAmount)
    })
  })

  //
  // Group priority
  //
  describe('group priority release condition', async () => {
    beforeEach(async () => {
      currentTime = await testERC20.currentTime()
      conditions.push(
        {
          unlockAt: 0,
          externalFee: {
            token: utils.eth_address,
            amount: data.ethAmount,
            receipt: data.externalFeeReceipt,
          },
          releasableBy: utils.address0,
          groupPriority: 1,
        },
        {
          unlockAt: 0,
          externalFee: {
            token: testERC20.address,
            amount: data.assetAmount.mul(5),
            receipt: data.externalFeeReceipt,
          },
          releasableBy: utils.address0,
          groupPriority: 2,
        },
        {
          unlockAt: currentTime.add(data.unlockAt),
          externalFee: {
            token: utils.address0,
            amount: 0,
            receipt: utils.address0,
          },
          releasableBy: recipient2.address,
          groupPriority: 0,
        },
      )
      conditionsEncoded = encodeCondition(conditions)
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

    it('user choose condition index in same condition priority group to release success', async () => {
      await testERC721.approve(juzuLocker.address, data.nftTokenId)
      await testERC20.approve(juzuLocker.address, data.assetAmount.mul(6))
      await juzuERC20.approve(juzuLocker.address, data.baseFeeAmount)

      await juzuLocker.addAssets(paramsEncoded)

      await network.provider.send('evm_increaseTime', [data.unlockAt + 50])

      groupIndex = 0
      conditionIndex = 1
      await expect(
        juzuLocker.connect(recipient2).release(groupIndex, conditionIndex),
      )
        .to.emit(juzuLocker, 'JuzuLockReleased')
        .withArgs(data.juzuTokenId, groupIndex, conditionIndex, recipient2.address, data.baseFeeAmount)
    })
    it('release with condition in group #1', async () => {
      await testERC721.approve(juzuLocker.address, data.nftTokenId)
      await testERC20.approve(juzuLocker.address, data.assetAmount.mul(6))
      await juzuERC20.approve(juzuLocker.address, data.baseFeeAmount)

      await juzuLocker.addAssets(paramsEncoded)

      await juzuLocker.depositExtraFee(utils.eth_address, data.ethAmount, {
        value: data.ethAmount,
      })

      conditionIndex = 0
      groupIndex = 1
      await expect(juzuLocker.release(groupIndex, conditionIndex))
        .to.emit(juzuLocker, 'JuzuLockReleased')
        .withArgs(data.juzuTokenId, groupIndex, conditionIndex, owner.address, data.baseFeeAmount)
        .to.emit(juzuLocker, 'JuzuLockWithdrawed')
        .withArgs(utils.eth_address, data.externalFeeReceipt, data.ethAmount)
    })
  })

  //
  // FULL LIFE Cycle
  //
  describe('life cycle', async () => {
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

    it('success life cycle of one Juzu', async () => {
      // create success & add locked data success with base fee
      await testERC721.approve(juzuLocker.address, data.nftTokenId)
      await testERC20.approve(juzuLocker.address, data.assetAmount)
      await juzuERC20.approve(juzuLocker.address, data.baseFeeAmount)
      await expect(juzuLocker.addAssets(paramsEncoded))
        .to.emit(juzuLocker, 'JuzuLockUpdated')
        .withArgs(owner.address, data.juzuTokenId)

      currentTime = utils.convertInt(await testERC20.currentTime())

      // check locked data and baseFee
      nft = await juzuLocker.nfts(0)
      expect(nft.tokenId).to.eq(data.nftTokenId)
      expect(nft.collection).to.eq(testERC721.address)
      asset = await juzuLocker.assets(0)
      expect(asset.amount).to.eq(data.assetAmount)
      expect(asset.token).to.eq(testERC20.address)
      expect(await juzuLocker.stakingApr()).to.eq(data.apr)
      expect(await juzuLocker.owner()).to.eq(owner.address)
      expect(await juzuLocker.tokenId()).to.eq(data.juzuTokenId)
      expect(await juzuLocker.depositedBaseFee()).to.eq(data.baseFeeAmount)
      expect(await juzuLocker.juzuFactory()).to.eq(juzuFactory.address)
      expect(await juzuLocker.juzuERC721()).to.eq(juzuERC721.address)
      expect(await juzuLocker.juzuERC20()).to.eq(juzuERC20.address)

      // transfer Owner to buyer
      await expect(
        juzuERC721.transferFrom(owner.address, buyer.address, data.juzuTokenId),
      )
        .to.emit(juzuERC721, 'Transfer')
        .withArgs(owner.address, buyer.address, data.juzuTokenId)
        .to.emit(juzuLocker, 'JuzuLockTransferedOwner')
        .withArgs(data.juzuTokenId, owner.address, buyer.address)
        .to.emit(juzuFactory, 'JuzuLockTransferedOwner')
        .withArgs(data.juzuTokenId, owner.address, buyer.address)

      // check new owner
      expect(await juzuLocker.owner()).to.eq(buyer.address)
      expect(await juzuERC721.ownerOf(data.juzuTokenId)).to.eq(buyer.address)

      // deposit extraFee
      await testERC20.approve(juzuLocker.address, data.assetAmount)
      await expect(juzuLocker.depositExtraFee(testERC20.address, data.assetAmount))
        .to.emit(juzuLocker, 'JuzuLockDeposited')
        .withArgs(data.juzuTokenId, testERC20.address, data.assetAmount)

      expect(
        await juzuLocker.depositedExtraFeeAmounts(testERC20.address),
      ).to.eq(data.assetAmount)

      // we created with baseFee above, dont need to deposit base Fee anymore

      // claim staking from baseFee after onemonth from the day addAssets + deposite base fee
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
      juzuOwnerBalance = await juzuERC20.balanceOf(buyer.address)
      await expect(juzuLocker.connect(buyer).claim(buyer.address))
        .to.emit(juzuLocker, 'JuzuClaimedStaking')
        .withArgs(claimValue, buyer.address)

      // check new Juzu balance + check information of staking reward
      expect(await juzuERC20.balanceOf(buyer.address)).to.eq(
        juzuOwnerBalance.add(claimValue),
      )
      expect(await juzuLocker.claimedAmount()).to.eq(claimValue)
      expect(await juzuLocker.lastDepositedAt()).to.eq(currentTime + month)
      expect(await juzuLocker.lastClaimedAt()).to.eq(currentTime + month)
      expect(await juzuLocker.lastRewardAmount()).to.eq(0)

      // after 2month, they release
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
        .withArgs(data.juzuTokenId, groupIndex, conditionIndex, buyer.address, data.baseFeeAmount)

      // check information of release, nft & assset
      expect(await juzuLocker.releasedBy()).to.eq(buyer.address)
      expect(await testERC721.ownerOf(data.nftTokenId)).to.eq(buyer.address)
      expect(await testERC20.balanceOf(buyer.address)).to.eq(
        testERC20OwnerBalance.add(data.assetAmount),
      )
      expect(await juzuERC20.balanceOf(juzuLocker.address)).to.eq(0) // baseFee was burned

      // burn JuzuERC721 after release, all unclaimed will be transfer to owner
      // currently total claim is 1 month
      juzuOwnerBalance = await juzuERC20.balanceOf(buyer.address)
      await expect(juzuLocker.connect(buyer).burn())
        .to.emit(juzuLocker, 'JuzuBurned')
        .withArgs(data.juzuTokenId)
        .to.emit(juzuLocker, 'JuzuClaimedStaking')
        .withArgs(claimValue, buyer.address)

      await expect(juzuERC721.ownerOf(data.juzuTokenId)).to.be.revertedWith('nonexistent') 
      expect(await juzuERC20.balanceOf(buyer.address)).to.eq(
        juzuOwnerBalance.add(claimValue),
      )
    })
  })
})
