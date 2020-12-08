const Raffle = artifacts.require('Raffle')
const MockVRFCoordinator = artifacts.require('MockVRFCoordinator')
const Token = artifacts.require('Token')
const LPToken = artifacts.require('LPToken')
const MockLinkswapFactory = artifacts.require('MockLinkswapFactory')
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
  const stakeCap = 3
  const activeDays = 3
  let raffle, stakingToken1, stakingToken2, stakingToken3, fakeToken, tokenA, tokenB, tokenC, tokenD, link, yfl, payoutToken, linkUsdFeed, linkswapFactory, vrfCoordinator

  before(async () => {
    const block = await web3.eth.getBlock('latest')
    const startTime = block.timestamp + 900
    LinkToken.setProvider(web3.currentProvider)
    MockV2Aggregator.setProvider(web3.currentProvider)
    link = await LinkToken.new({ from: maintainer })
    linkswapFactory = await MockLinkswapFactory.new()
    tokenA = await Token.new('Token A', 'TA', { from: maintainer })
    tokenB = await Token.new('Token B', 'TB', { from: maintainer })
    tokenC = await Token.new('Token C', 'TC', { from: maintainer })
    tokenD = await Token.new('Token D', 'TD', { from: maintainer })
    stakingToken1 = await LPToken.new(
      'Staking Token 1',
      'ST1',
      tokenA.address,
      tokenB.address,
      { from: maintainer }
    )
    stakingToken2 = await LPToken.new(
      'Staking Token 2',
      'ST2',
      tokenA.address,
      tokenC.address,
      { from: maintainer }
    )
    stakingToken3 = await LPToken.new(
      'Staking Token 3',
      'ST3',
      tokenA.address,
      tokenD.address,
      { from: maintainer }
    )
    fakeToken = await LPToken.new(
      'Fake Token',
      'FKT',
      tokenA.address,
      tokenC.address,
      { from: maintainer })
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
      linkswapFactory.address,
      stakeAmount,
      stakeCap,
      yfl.address,
      payoutAmount,
      startTime,
      activeDays,
      { from: maintainer },
    )
    await linkswapFactory.createPair(tokenA.address, tokenB.address, stakingToken1.address, { from: maintainer })
    await linkswapFactory.createPair(tokenA.address, tokenC.address, stakingToken2.address, { from: maintainer })
    await linkswapFactory.createPair(tokenA.address, tokenD.address, stakingToken3.address, { from: maintainer })
    await fakeToken.transfer(user1, ether('100'), { from: maintainer })
    await stakingToken1.transfer(user1, ether('100'), { from: maintainer })
    await stakingToken1.transfer(user2, ether('100'), { from: maintainer })
    await stakingToken1.transfer(user3, ether('100'), { from: maintainer })
    // skip user4
    await stakingToken2.transfer(user5, ether('100'), { from: maintainer })
    await stakingToken2.transfer(user6, ether('100'), { from: maintainer })
    await stakingToken2.transfer(user7, ether('100'), { from: maintainer })
    await stakingToken2.transfer(user8, ether('100'), { from: maintainer })
    await stakingToken2.transfer(user9, ether('100'), { from: maintainer })
    await stakingToken3.transfer(user9, ether('100'), { from: maintainer })
    // users approve the contract for spending LP tokens
    await fakeToken.approve(raffle.address, ether('100'), { from: user1 })
    await stakingToken1.approve(raffle.address, ether('100'), { from: user1 })
    await stakingToken1.approve(raffle.address, ether('100'), { from: user2 })
    await stakingToken1.approve(raffle.address, ether('100'), { from: user3 })
    await stakingToken2.approve(raffle.address, ether('100'), { from: user5 })
    await stakingToken2.approve(raffle.address, ether('100'), { from: user6 })
    await stakingToken2.approve(raffle.address, ether('100'), { from: user7 })
    await stakingToken2.approve(raffle.address, ether('100'), { from: user8 })
    await stakingToken2.approve(raffle.address, ether('100'), { from: user9 })
    await stakingToken3.approve(raffle.address, ether('100'), { from: user9 })
  })

  it('must be initialized first', async () => {
    await expectRevert(
      raffle.stake(stakingToken1.address, { from: user4 }),
      '!initialized'
    )

    await expectRevert(
      raffle.init(
        [
          stakingToken1.address,
          stakingToken1.address,
          stakingToken1.address,
          stakingToken1.address,
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
          stakingToken1.address,
          stakingToken1.address,
          stakingToken1.address,
          stakingToken1.address,
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
          stakingToken1.address,
          stakingToken1.address,
          stakingToken1.address
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
          stakingToken1.address,
          stakingToken1.address,
          stakingToken1.address,
          stakingToken2.address
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
      '!_stakingTokens'
    )

    await link.approve(raffle.address, ether('3'), { from: maintainer })
    await yfl.transfer(raffle.address, ether('3'), { from: maintainer })
    await payoutToken.transfer(raffle.address, ether('1'), { from: maintainer })
    await raffle.init(
      [stakingToken1.address, stakingToken2.address],
      [constants.ZERO_ADDRESS, payoutToken.address],
      [0, payoutAmount]
    )
    assert.isTrue(await raffle.initialized())
    assert.isTrue(ether('3').eq(await link.balanceOf(raffle.address)))
    assert.isTrue(ether('3').eq(await yfl.balanceOf(raffle.address)))

    await expectRevert(
      raffle.init(
        [stakingToken1.address, stakingToken2.address],
        [constants.ZERO_ADDRESS, payoutToken.address],
        [0, payoutAmount]
      ),
      'initialized'
    )
  })

  it('staking day 1', async () => {
    await expectRevert(
      raffle.stake(stakingToken1.address, { from: user1 }),
      '!startTime'
    )
    // raffle begins day 0
    await time.increase(901)
    assert.equal(0, await raffle.currentDay())
    await raffle.stake(stakingToken1.address, { from: user1 })
    assert.isTrue(ether('1').eq(await stakingToken1.balanceOf(raffle.address)))
    assert.isTrue(ether('99').eq(await stakingToken1.balanceOf(user1)))
    assert.equal(baseURI + '0', await raffle.tokenURI(0))
    await raffle.stake(stakingToken1.address, { from: user2 })
    assert.isTrue(ether('2').eq(await stakingToken1.balanceOf(raffle.address)))
    assert.isTrue(ether('99').eq(await stakingToken1.balanceOf(user2)))
    assert.equal(baseURI + '1', await raffle.tokenURI(1))
    await raffle.stake(stakingToken1.address, { from: user3 })
    assert.isTrue(ether('3').eq(await stakingToken1.balanceOf(raffle.address)))
    assert.isTrue(ether('99').eq(await stakingToken1.balanceOf(user3)))
    assert.equal(baseURI + '2', await raffle.tokenURI(2))
    await expectRevert(
      raffle.stake(stakingToken2.address, { from: user5 }),
      '!currentStakingToken'
    )
  })

  it('staking day 2', async () => {
    await time.increase(n1Day)
    assert.equal(1, await raffle.currentDay())
    const tx = await raffle.stake(stakingToken2.address, { from: user5 })
    const requestId = tx.logs[1].args._requestId
    assert.isTrue(ether('1').eq(await stakingToken2.balanceOf(raffle.address)))
    assert.isTrue(ether('99').eq(await stakingToken2.balanceOf(user5)))
    assert.equal(baseURI + '3', await raffle.tokenURI(3))
    // users can still stake before the VRF response
    await raffle.stake(stakingToken2.address, { from: user6 })
    // users cannot unstake before the VRF response
    await expectRevert(
      raffle.unstake({ from: user1 }),
      '!answered'
    )
    await vrfCoordinator.fulfillRandomnessRequest(raffle.address, requestId, randomNumber1)
    const winners = await raffle.winners()
    assert.equal(user1, await raffle.ownerOf(winners[0]))
    await raffle.stake(stakingToken2.address, { from: user7 })
    await raffle.stake(stakingToken2.address, { from: user8 })
    const unstakeTx = await raffle.unstake({ from: user1 })
    await expectEvent.inTransaction(unstakeTx.tx, yfl, 'Transfer', {
      from: raffle.address,
      to: user1
    })
    await raffle.unstake({ from: user2 })
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
    await raffle.stake(stakingToken2.address, { from: user9 })
    const winners = await raffle.winners()
    assert.equal(user1, await raffle.ownerOf(winners[0]))
    assert.equal(user7, await raffle.ownerOf(winners[1]))
    await raffle.stake(stakingToken2.address, { from: user9 })
    await raffle.stake(stakingToken3.address, { from: user9 })
    assert.isTrue(ether('6').eq(await stakingToken2.balanceOf(raffle.address)))
    await raffle.transferFrom(user6, user4, 4, { from: user6 })
    assert.equal(user4, await raffle.ownerOf(4))
    const unstakeTx = await raffle.unstake({ from: user4 })
    await expectEvent.inTransaction(unstakeTx.tx, stakingToken2, 'Transfer', {
      from: raffle.address,
      to: user4
    })

    await expectRevert(
      raffle.stake(stakingToken2.address, { from: user9 }),
      'stakeCap'
    )

    await expectRevert(
      raffle.getRandomNumber(),
      '!canGetRandomNumber'
    )

    await expectRevert(
      raffle.stake(fakeToken.address, { from: user1 }),
      '!_stakingToken'
    )
  })

  it('users can trade the NFTs', async () => {
    await raffle.transferFrom(user5, user4, 3, { from: user5 })
    assert.equal(user4, await raffle.ownerOf(3))
    assert.equal(2, await raffle.balanceOf(user4))
  })

  it('users cannot stake after drawing ends', async () => {
    await time.increase(n1Day)
    await expectRevert(
      raffle.stake(stakingToken1.address, { from: user1 }),
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
    const tx2 = await raffle.unstake({ from: user7 })
    await expectEvent.inTransaction(tx2.tx, yfl, 'Transfer', {
      from: raffle.address,
      to: user7
    })
    const tx3 = await raffle.unstake({ from: user9 })
    await expectEvent.inTransaction(tx3.tx, yfl, 'Transfer', {
      from: raffle.address,
      to: user9
    })
    await raffle.unstake({ from: user3 })
    await expectRevert(
      raffle.unstake({ from: user6 }),
      '!staked'
    )
    await raffle.unstake({ from: user8 })
    await expectRevert(
      raffle.unstake({ from: user5 }),
      '!staked'
    )
  })
})
