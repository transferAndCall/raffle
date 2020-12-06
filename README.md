# Raffle

Deployment/usage process:
 - Deploy contract with documented parameters set
 - Approve contract to spend LINK and the payoutToken for the amount multiplied by the winners
 - Optionally you can simply send LINK and the payoutToken directly to the contract
 - Call init(address[]) with the addresses to be used for staking (the LP tokens)
 - Users will need to approve the contract to spend the staking token
 - Users can call stake(address) to stake the stakeAmount of the staking token and receive 1 NFT
 - Users can stake as many times as they want until the drawing time
 - After the drawing time, call getRandomNumber() one final time
 - The first to stake on the next day creates the randomness request for the previous day
 - When random numbers are received, winners are announced via an event
 - Winners can also be seen by calling winners()
 - When the day has ended, users can call unstake() to receive their staking tokens back and collect rewards if they're a winner

## Setup

```
yarn
```

## Test

```
truffle test
```
