# Raffle

Deployment/usage process:
 - Deploy contract with documented parameters set
 - Approve contract to spend LINK and YFL for the amount multiplied by the number of days
 - Optionally you can simply send LINK and YFL directly to the contract
 - Call init(address[],address[],uint256[]) with the addresses to be used for staking (the LP tokens), the addresses to be used for any sponsor payouts for that day, and the amount of sponsor payouts
 - At this point, the contract is simply waiting for the start time to pass
 - Users will need to approve the contract to spend the staking token
 - Users can call stake(address) to stake the stakeAmount of the staking token and receive 1 NFT
 - Users can stake as many times as they want until the drawing time for that day
 - The first to stake on the next day creates the randomness request for the previous day
 - When random numbers are received, winners are announced via an event
 - Winning tokenIDs can also be seen by calling winners()
 - When the day has ended, users can call unstake() to receive their staking tokens back and collect rewards if they're a winner
 - The process of staking and getting a random number repeats for as many days of the raffle
 - After the last day, someone must call getRandomNumber() one final time to select the last day's winner

## Setup

```
yarn
```

## Test

```
truffle test
```
