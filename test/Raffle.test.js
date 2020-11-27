const Raffle = artifacts.require('Raffle')
const MockVRFCoordinator = artifacts.require('MockVRFCoordinator')
const Token = artifacts.require('Token')
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
  const name = 'Raffle 2020'
  const symbol = 'LG20'
  const baseURI = 'http://example.com/'
  const winningNumber = new BN('770')
  const linkUsd = 1000000000
  const vrfKeyHash = constants.ZERO_BYTES32
  const vrfFee = ether('1')
  const payoutWinners = 1
  const payoutAmount = ether('1')
  const stakeAmount = ether('1')
  const drawingTime = Math.floor(Date.now() / 1000) + 900
  let raffle, stakingToken1, stakingToken2, fakeToken, link, paymentToken, linkUsdFeed, vrfCoordinator

  before(async () => {
    LinkToken.setProvider(web3.currentProvider)
    MockV2Aggregator.setProvider(web3.currentProvider)
    link = await LinkToken.new({ from: maintainer })
    stakingToken1 = await Token.new({ from: maintainer })
    stakingToken2 = await Token.new({ from: maintainer })
    fakeToken = await Token.new({ from: maintainer })
    paymentToken = await Token.new({ from: maintainer })
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
      paymentToken.address,
      payoutWinners,
      payoutAmount,
      drawingTime,
      { from: maintainer },
    )
    await fakeToken.transfer(user1, ether('100'), { from: maintainer })
    await stakingToken1.transfer(user1, ether('100'), { from: maintainer })
    await stakingToken1.transfer(user2, ether('100'), { from: maintainer })
    await stakingToken1.transfer(user3, ether('100'), { from: maintainer })
    // skip user4
    await stakingToken2.transfer(user5, ether('100'), { from: maintainer })
    // users approve the contract for spending LP tokens
    await fakeToken.approve(raffle.address, ether('100'), { from: user1 })
    await stakingToken1.approve(raffle.address, ether('100'), { from: user1 })
    await stakingToken1.approve(raffle.address, ether('100'), { from: user2 })
    await stakingToken1.approve(raffle.address, ether('100'), { from: user3 })
    await stakingToken2.approve(raffle.address, ether('100'), { from: user5 })
  })

  it('must be initialized first', async () => {
    await expectRevert(
      raffle.stake(stakingToken1.address, { from: user4 }),
      '!initialized'
    )

    await link.approve(raffle.address, ether('7'), { from: maintainer })
    await paymentToken.approve(raffle.address, ether('1'), { from: maintainer })
    await raffle.init([stakingToken1.address, stakingToken2.address])
    assert.isTrue(await raffle.initialized())
    assert.isTrue(ether('1').eq(await link.balanceOf(raffle.address)))
    assert.isTrue(ether('1').eq(await paymentToken.balanceOf(raffle.address)))

    await expectRevert(
      raffle.init([stakingToken1.address, stakingToken2.address]),
      'initialized'
    )
  })

  it('allows users to stake', async () => {
    await raffle.stake(stakingToken1.address, { from: user1 })
    assert.isTrue(ether('1').eq(await stakingToken1.balanceOf(raffle.address)))
    assert.isTrue(ether('99').eq(await stakingToken1.balanceOf(user1)))
    assert.equal(baseURI + '1', await raffle.tokenURI(1))
    await raffle.stake(stakingToken1.address, { from: user2 })
    assert.isTrue(ether('2').eq(await stakingToken1.balanceOf(raffle.address)))
    assert.isTrue(ether('99').eq(await stakingToken1.balanceOf(user2)))
    assert.equal(baseURI + '2', await raffle.tokenURI(2))
    await raffle.stake(stakingToken1.address, { from: user3 })
    assert.isTrue(ether('3').eq(await stakingToken1.balanceOf(raffle.address)))
    assert.isTrue(ether('99').eq(await stakingToken1.balanceOf(user3)))
    assert.equal(baseURI + '3', await raffle.tokenURI(3))
    await raffle.stake(stakingToken2.address, { from: user5 })
    assert.isTrue(ether('1').eq(await stakingToken2.balanceOf(raffle.address)))
    assert.isTrue(ether('99').eq(await stakingToken2.balanceOf(user5)))
    assert.equal(baseURI + '4', await raffle.tokenURI(4))

    await expectRevert(
      raffle.unstake({ from: user1 }),
      '!ended'
    )

    await expectRevert(
      raffle.getRandomNumber(),
      '!drawingTime'
    )

    await expectRevert(
      raffle.stake(fakeToken.address, { from: user1 }),
      '!stakingToken'
    )
  })

  it('users can trade the NFTs', async () => {
    await raffle.transferFrom(user1, user4, 1, { from: user1 })
    assert.equal(user4, await raffle.ownerOf(1))
    await raffle.transferFrom(user5, user4, 4, { from: user5 })
    assert.equal(user4, await raffle.ownerOf(4))
    assert.equal(2, await raffle.balanceOf(user4))
  })

  it('users cannot stake after drawing ends', async () => {
    await time.increase(901)
    await expectRevert(
      raffle.stake(stakingToken1.address, { from: user4 }),
      'ended'
    )
  })

  it('selects a winner', async () => {
    const tx = await raffle.getRandomNumber()
    const requestId = tx.logs[0].args._requestId
    await expectRevert(
      raffle.getRandomNumber(),
      'request'
    )
    await vrfCoordinator.fulfillRandomnessRequest(raffle.address, requestId, winningNumber)
    const winners = await raffle.winners()
    assert.equal(user2, await raffle.ownerOf(winners[0]))

    await expectRevert(
      raffle.getRandomNumber(),
      '!winners'
    )
  })

  it('allows unstaking', async () => {
    const txWinningClaim = await raffle.unstake({ from: user2 })
    await expectEvent.inTransaction(txWinningClaim.tx, paymentToken, 'Transfer', {
      from: raffle.address,
      to: user2
    })
    assert.isTrue(ether('2').eq(await stakingToken1.balanceOf(raffle.address)))
    assert.isTrue(ether('100').eq(await stakingToken1.balanceOf(user2)))
    await raffle.unstake({ from: user3 })
    assert.isTrue(ether('1').eq(await stakingToken1.balanceOf(raffle.address)))
    assert.isTrue(ether('100').eq(await stakingToken1.balanceOf(user3)))
    assert.isTrue(ether('1').eq(await stakingToken2.balanceOf(raffle.address)))
    await raffle.unstake({ from: user4 })
    assert.isTrue(ether('0').eq(await stakingToken1.balanceOf(raffle.address)))
    assert.isTrue(ether('0').eq(await stakingToken2.balanceOf(raffle.address)))
    assert.isTrue(ether('1').eq(await stakingToken1.balanceOf(user4)))
    assert.isTrue(ether('1').eq(await stakingToken2.balanceOf(user4)))
  })
})
