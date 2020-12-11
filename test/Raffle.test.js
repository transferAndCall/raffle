const Raffle = artifacts.require('Raffle')
const MockVRFCoordinator = artifacts.require('MockVRFCoordinator')
const Token = artifacts.require('Token')
const RewardsVault = artifacts.require('RewardsVault')
const { LinkToken } = require('@chainlink/contracts/truffle/v0.4/LinkToken')
const { MockV2Aggregator } = require('@chainlink/contracts/truffle/v0.6/MockV2Aggregator')
const { BN, constants, ether, expectEvent, expectRevert, time } = require('@openzeppelin/test-helpers')

contract('Raffle', (accounts) => {
  const maintainer = accounts[0]
  const user1 = accounts[1]
  const user2 = accounts[2]
  const user3 = accounts[3]
  const user4 = accounts[4]
  const user5 = accounts[5]
  const user6 = accounts[6]
  const user7 = accounts[7]
  const user8 = accounts[8]
  const user9 = accounts[9]
  const n1Day = 86400
  const name = 'Raffle 2020'
  const symbol = 'LG20'
  const baseURI = 'http://example.com/'
  const randomNumber1 = new BN('770')
  const randomNumber2 = new BN('479')
  const randomNumber3 = new BN('534')
  const linkUsd = 1000000000
  const vrfKeyHash = constants.ZERO_BYTES32
  const vrfFee = ether('1')
  const payoutAmount = ether('1')
  const stakeAmount = ether('1')
  const entryCap = 3
  const activeDays = 3
  let raffle, lpToken1, lpToken2, lpToken3, rewardsVault1, rewardsVault2, fakeToken, link, yfl, payoutToken, linkUsdFeed, vrfCoordinator

  before(async () => {
    const block = await web3.eth.getBlock('latest')
    const startTime = block.timestamp + 900
    LinkToken.setProvider(web3.currentProvider)
    MockV2Aggregator.setProvider(web3.currentProvider)
    link = await LinkToken.new({ from: maintainer })
    lpToken1 = await Token.new(
      'LP Token 1',
      'LP1',
      { from: maintainer }
    )
    lpToken2 = await Token.new(
      'LP Token 2',
      'LP2',
      { from: maintainer }
    )
    lpToken3 = await Token.new(
      'LP Token 3',
      'LP3',
      { from: maintainer }
    )
    fakeToken = await Token.new(
      'Fake Token',
      'FKT',
      { from: maintainer })
    rewardsVault1 = await RewardsVault.new(lpToken1.address)
    rewardsVault2 = await RewardsVault.new(lpToken2.address)
    rewardsVault3 = await RewardsVault.new(lpToken3.address)
    payoutToken = await Token.new('Sponsor Payout Token', 'SPT', { from: maintainer })
    yfl = await Token.new('YFLink', 'YFL', { from: maintainer })
    vrfCoordinator = await MockVRFCoordinator.new(link.address, ether('1'), { from: maintainer })
    linkUsdFeed = await MockV2Aggregator.new(linkUsd, { from: maintainer })
    raffle = await Raffle.new(
      name,
      symbol,
      baseURI,
      vrfKeyHash,
      vrfFee,
      vrfCoordinator.address,
      link.address,
      linkUsdFeed.address,
      stakeAmount,
      entryCap,
      yfl.address,
      payoutAmount,
      startTime,
      activeDays,
      { from: maintainer },
    )
    await fakeToken.transfer(user1, ether('100'), { from: maintainer })
    await lpToken1.transfer(user1, ether('100'), { from: maintainer })
    await lpToken1.transfer(user2, ether('100'), { from: maintainer })
    await lpToken1.transfer(user3, ether('100'), { from: maintainer })
    // skip user4
    await lpToken2.transfer(user5, ether('100'), { from: maintainer })
    await lpToken2.transfer(user6, ether('100'), { from: maintainer })
    await lpToken2.transfer(user7, ether('100'), { from: maintainer })
    await lpToken2.transfer(user8, ether('100'), { from: maintainer })
    await lpToken2.transfer(user9, ether('100'), { from: maintainer })
    await lpToken3.transfer(user9, ether('100'), { from: maintainer })

    await lpToken1.approve(rewardsVault1.address, ether('100'), { from: user1 })
    await lpToken1.approve(rewardsVault1.address, ether('100'), { from: user2 })
    await lpToken2.approve(rewardsVault2.address, ether('100'), { from: user6 })
    await lpToken2.approve(rewardsVault2.address, ether('100'), { from: user8 })
    await rewardsVault1.deposit(ether('100'), { from: user1 })
    await rewardsVault1.deposit(ether('100'), { from: user2 })
    await rewardsVault2.deposit(ether('50'), { from: user6 })
    await rewardsVault2.deposit(ether('100'), { from: user8 })
  })

  it('must be initialized first', async () => {
    await expectRevert(
      raffle.enter({ from: user4 }),
      '!initialized'
    )

    await expectRevert(
      raffle.init(
        [
          lpToken1.address,
          lpToken1.address,
          lpToken1.address,
          lpToken1.address,
        ],
        [
          rewardsVault1.address,
          rewardsVault1.address,
          rewardsVault1.address,
          rewardsVault1.address,
        ],
        [
          constants.ZERO_ADDRESS,
          payoutToken.address,
          constants.ZERO_ADDRESS,
          constants.ZERO_ADDRESS
        ],
        [
          payoutAmount,
          payoutAmount,
          payoutAmount
        ]
      ),
      '!length'
    )

    await expectRevert(
      raffle.init(
        [
          lpToken1.address,
          lpToken1.address,
          lpToken1.address,
          lpToken1.address,
        ],
        [
          rewardsVault1.address,
          rewardsVault1.address,
          rewardsVault1.address,
          rewardsVault1.address,
        ],
        [
          constants.ZERO_ADDRESS,
          payoutToken.address,
          constants.ZERO_ADDRESS
        ],
        [
          payoutAmount,
          payoutAmount,
          payoutAmount,
          payoutAmount
        ]
      ),
      '!length'
    )

    await expectRevert(
      raffle.init(
        [
          lpToken1.address,
          lpToken1.address,
          lpToken1.address
        ],
        [
          rewardsVault1.address,
          rewardsVault1.address,
          rewardsVault1.address,
          rewardsVault1.address,
        ],
        [
          constants.ZERO_ADDRESS,
          payoutToken.address,
          constants.ZERO_ADDRESS,
          constants.ZERO_ADDRESS
        ],
        [
          payoutAmount,
          payoutAmount,
          payoutAmount,
          payoutAmount
        ]
      ),
      '!length'
    )

    await expectRevert(
      raffle.init(
        [
          lpToken1.address,
          lpToken1.address,
          lpToken1.address,
          lpToken2.address
        ],
        [
          rewardsVault1.address,
          rewardsVault1.address,
          rewardsVault1.address,
          rewardsVault1.address,
        ],
        [
          constants.ZERO_ADDRESS,
          payoutToken.address,
          constants.ZERO_ADDRESS,
          constants.ZERO_ADDRESS
        ],
        [
          payoutAmount,
          payoutAmount,
          payoutAmount,
          payoutAmount
        ]
      ),
      '!_lpTokens'
    )

    await link.transfer(raffle.address, ether('3'), { from: maintainer })
    await yfl.transfer(raffle.address, ether('3'), { from: maintainer })
    await payoutToken.transfer(raffle.address, ether('1'), { from: maintainer })
    await raffle.init(
      [lpToken1.address, lpToken2.address, lpToken3.address],
      [rewardsVault1.address, rewardsVault2.address, rewardsVault3.address],
      [constants.ZERO_ADDRESS, payoutToken.address, constants.ZERO_ADDRESS],
      [0, payoutAmount, 0]
    )
    assert.isTrue(await raffle.initialized())
    assert.isTrue(ether('3').eq(await link.balanceOf(raffle.address)))
    assert.isTrue(ether('3').eq(await yfl.balanceOf(raffle.address)))

    await expectRevert(
      raffle.init(
        [lpToken1.address, lpToken2.address],
        [rewardsVault1.address, rewardsVault2.address],
        [constants.ZERO_ADDRESS, payoutToken.address],
        [0, payoutAmount]
      ),
      'initialized'
    )
  })

  it('staking day 1', async () => {
    await expectRevert(
      raffle.enter({ from: user1 }),
      '!startTime'
    )
    // raffle begins day 0
    await time.increase(901)
    assert.equal(0, await raffle.currentDay())
    await raffle.enter({ from: user1 })
    assert.equal(baseURI + '0', await raffle.tokenURI(0))
    assert.equal(user1, await raffle.ownerOf(0))
    await raffle.enter({ from: user2 })
    assert.equal(baseURI + '1', await raffle.tokenURI(1))
    assert.equal(user2, await raffle.ownerOf(1))
    await raffle.enter({ from: user3 })
    assert.equal(baseURI + '2', await raffle.tokenURI(2))
    assert.equal(user3, await raffle.ownerOf(2))
    await expectRevert(
      raffle.enter({ from: user5 }),
      '!canEnter'
    )
  })

  it('staking day 2', async () => {
    await time.increase(n1Day)
    assert.equal(1, await raffle.currentDay())
    const tx = await raffle.enter({ from: user5 })
    const requestId = tx.logs[1].args._requestId
    assert.equal(baseURI + '3', await raffle.tokenURI(3))
    assert.equal(user5, await raffle.ownerOf(3))
    // users can still enter before the VRF response
    await raffle.enter({ from: user6 })
    assert.equal(user6, await raffle.ownerOf(4))
    // users cannot claim before the VRF response
    await expectRevert(
      raffle.claim({ from: user1 }),
      '!answered'
    )
    await vrfCoordinator.fulfillRandomnessRequest(raffle.address, requestId, randomNumber1)
    const winners = await raffle.winners()
    assert.equal(user1, await raffle.ownerOf(winners[0]))
    await raffle.enter({ from: user7 })
    assert.equal(user7, await raffle.ownerOf(5))
    await raffle.enter({ from: user8 })
    assert.equal(user8, await raffle.ownerOf(6))
    const claimTx = await raffle.claim({ from: user1 })
    await expectEvent.inTransaction(claimTx.tx, yfl, 'Transfer', {
      from: raffle.address,
      to: user1
    })
    // claiming without winning does nothing (but does not revert)
    const claimTx2 = await raffle.claim({ from: user2 })
    assert.equal(0, claimTx2.receipt.rawLogs.length)
  })

  it('staking day 3', async () => {
    await time.increase(n1Day)
    assert.equal(2, await raffle.currentDay())
    // randomness can still be requested manually
    const tx = await raffle.getRandomNumber()
    await expectRevert(
      raffle.getRandomNumber(),
      '!canGetRandomNumber'
    )
    const requestId = tx.logs[0].args._requestId
    await vrfCoordinator.fulfillRandomnessRequest(raffle.address, requestId, randomNumber2)
    await raffle.enter({ from: user9 })
    const winners = await raffle.winners()
    assert.equal(user1, await raffle.ownerOf(winners[0]))
    assert.equal(user7, await raffle.ownerOf(winners[1]))
    await raffle.enter({ from: user9 })
    await raffle.enter({ from: user9 })
    await raffle.transferFrom(user6, user4, 4, { from: user6 })
    assert.equal(user4, await raffle.ownerOf(4))

    await expectRevert(
      raffle.enter({ from: user9 }),
      'entryCap'
    )

    await expectRevert(
      raffle.getRandomNumber(),
      '!canGetRandomNumber'
    )

    await expectRevert(
      raffle.enter({ from: user1 }),
      '!canEnter'
    )
  })

  it('users can trade the NFTs', async () => {
    await raffle.transferFrom(user5, user4, 3, { from: user5 })
    assert.equal(user4, await raffle.ownerOf(3))
    assert.equal(2, await raffle.balanceOf(user4))
  })

  it('users cannot enter after drawing ends', async () => {
    await time.increase(n1Day)
    await expectRevert(
      raffle.enter({ from: user1 }),
      'ended'
    )
  })

  it('selects a final winner', async () => {
    const tx = await raffle.getRandomNumber()
    const requestId = tx.logs[0].args._requestId
    await expectRevert(
      raffle.getRandomNumber(),
      '!canGetRandomNumber'
    )
    await vrfCoordinator.fulfillRandomnessRequest(raffle.address, requestId, randomNumber3)
    const winners = await raffle.winners()
    assert.equal(user1, await raffle.ownerOf(winners[0]))
    assert.equal(user7, await raffle.ownerOf(winners[1]))
    assert.equal(user9, await raffle.ownerOf(winners[2]))
  })

  it('allows unstaking after the last drawing', async () => {
    const tx2 = await raffle.claim({ from: user7 })
    await expectEvent.inTransaction(tx2.tx, payoutToken, 'Transfer', {
      from: raffle.address,
      to: user7
    })
    await expectEvent.inTransaction(tx2.tx, yfl, 'Transfer', {
      from: raffle.address,
      to: user7
    })
    const tx3 = await raffle.claim({ from: user9 })
    await expectEvent.inTransaction(tx3.tx, yfl, 'Transfer', {
      from: raffle.address,
      to: user9
    })

    // claiming fails if not holding an NFT
    await expectRevert(
      raffle.claim({ from: user6 }),
      '!balance'
    )
  })
})
