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
  const winningNumber = new BN('770')
  const linkUsd = 1000000000
  const vrfKeyHash = constants.ZERO_BYTES32
  const vrfFee = ether('1')
  const payoutWinners = 1
  const payoutAmount = ether('1')
  const stakeAmount = ether('1')
  const drawingTime = Math.floor(Date.now() / 1000) + 900
  let raffle, stakingToken, link, paymentToken, linkUsdFeed, vrfCoordinator

  beforeEach(async () => {
    LinkToken.setProvider(web3.currentProvider)
    MockV2Aggregator.setProvider(web3.currentProvider)
    link = await LinkToken.new({ from: maintainer })
    stakingToken = await Token.new({ from: maintainer })
    paymentToken = await Token.new({ from: maintainer })
    vrfCoordinator = await MockVRFCoordinator.new(link.address, ether('1'), { from: maintainer })
    linkUsdFeed = await MockV2Aggregator.new(linkUsd, { from: maintainer })
    raffle = await Raffle.new(
      name,
      symbol,
      vrfKeyHash,
      vrfFee,
      vrfCoordinator.address,
      link.address,
      linkUsdFeed.address,
      stakingToken.address,
      stakeAmount,
      paymentToken.address,
      payoutWinners,
      payoutAmount,
      drawingTime,
      { from: maintainer },
    )
    await stakingToken.transfer(user1, ether('100'), { from: maintainer })
    await stakingToken.transfer(user2, ether('100'), { from: maintainer })
    await stakingToken.transfer(user3, ether('100'), { from: maintainer })
    // skip user4
    await stakingToken.transfer(user5, ether('100'), { from: maintainer })
  })

  it('selects a winner', async () => {
    // users approve the contract for spending LP tokens
    await stakingToken.approve(raffle.address, ether('100'), { from: user1 })
    await stakingToken.approve(raffle.address, ether('100'), { from: user2 })
    await stakingToken.approve(raffle.address, ether('100'), { from: user3 })
    await stakingToken.approve(raffle.address, ether('100'), { from: user5 })

    await expectRevert(
      raffle.stake({ from: user4 }),
      '!funded'
    )

    // fund the contract
    await link.approve(raffle.address, ether('7'), { from: maintainer })
    await paymentToken.approve(raffle.address, ether('1'), { from: maintainer })
    await raffle.fund()
    assert.isTrue(ether('1').eq(await link.balanceOf(raffle.address)))
    assert.isTrue(ether('1').eq(await paymentToken.balanceOf(raffle.address)))

    await expectRevert(
      raffle.fund(),
      'funded'
    )

    // users stake
    await raffle.stake({ from: user1 })
    assert.isTrue(ether('1').eq(await stakingToken.balanceOf(raffle.address)))
    assert.isTrue(ether('99').eq(await stakingToken.balanceOf(user1)))
    await raffle.stake({ from: user2 })
    assert.isTrue(ether('2').eq(await stakingToken.balanceOf(raffle.address)))
    assert.isTrue(ether('99').eq(await stakingToken.balanceOf(user2)))
    await raffle.stake({ from: user3 })
    assert.isTrue(ether('3').eq(await stakingToken.balanceOf(raffle.address)))
    assert.isTrue(ether('99').eq(await stakingToken.balanceOf(user3)))
    await raffle.stake({ from: user5 })
    assert.isTrue(ether('4').eq(await stakingToken.balanceOf(raffle.address)))
    assert.isTrue(ether('99').eq(await stakingToken.balanceOf(user5)))

    await expectRevert(
      raffle.unstake({ from: user1 }),
      '!ended'
    )

    await expectRevert(
      raffle.getRandomNumber(),
      '!drawingTime'
    )

    // users can trade NFTs
    await raffle.transferFrom(user1, user4, 1, { from: user1 })
    assert.equal(user4, await raffle.ownerOf(1))
    await raffle.transferFrom(user5, user4, 4, { from: user5 })
    assert.equal(user4, await raffle.ownerOf(4))
    assert.equal(2, await raffle.balanceOf(user4))

    // drawing ends
    await time.increase(901)

    await expectRevert(
      raffle.stake({ from: user4 }),
      'ended'
    )

    // get random number
    const tx = await raffle.getRandomNumber()
    const requestId = tx.logs[0].args._requestId
    await expectRevert(
      raffle.getRandomNumber(),
      'request'
    )
    await vrfCoordinator.fulfillRandomnessRequest(raffle.address, requestId, winningNumber)
    const winners = await raffle.winners()
    assert.equal(user2, winners[0])

    await expectRevert(
      raffle.getRandomNumber(),
      '!winners'
    )

    // users unstake
    const txWinningClaim = await raffle.unstake({ from: user2 })
    await expectEvent.inTransaction(txWinningClaim.tx, paymentToken, 'Transfer', {
      from: raffle.address,
      to: user2
    })
    assert.isTrue(ether('3').eq(await stakingToken.balanceOf(raffle.address)))
    assert.isTrue(ether('100').eq(await stakingToken.balanceOf(user2)))
    await raffle.unstake({ from: user3 })
    assert.isTrue(ether('2').eq(await stakingToken.balanceOf(raffle.address)))
    assert.isTrue(ether('100').eq(await stakingToken.balanceOf(user3)))
    await raffle.unstake({ from: user4 })
    assert.isTrue(ether('0').eq(await stakingToken.balanceOf(raffle.address)))
    assert.isTrue(ether('2').eq(await stakingToken.balanceOf(user4)))
  })
})
