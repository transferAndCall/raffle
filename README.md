# Raffle

Deployment/usage process:
 - Deploy contract with documented parameters set
 - Fund the contract with YFL, LINK, and any sponsor-specific tokens
 - Call init(address[],address[],address[],uint256[]) with the addresses of the LP tokens, the vault addresses, the addresses to be used for any sponsor payouts for that day, and the amount of sponsor payouts
 - At this point, the contract is simply waiting for the start time to pass
 - Users can call enter() to enter the raffle and receive 1 NFT
 - Users can enter as many times as the entry cap
 - The first to enter on the next day creates the randomness request for the previous day
 - When random numbers are received, winners are announced via an event
 - Winning tokenIDs can also be seen by calling winners() or querying details(uint256)
 - When the day has ended, winners can call claim() to collect rewards
 - The process of entering and getting a random number repeats for as many days of the raffle
 - After the last day, someone must call getRandomNumber() one final time to select the last day's winner

## Setup

```
yarn
```

## Test

```
truffle test
```
