# Raffle

Deployment/usage process:
- Deploy contract with documented parameters set
- Approve contract to spend LINK and the payoutToken for the amount multiplied by the winners
- Call init(address[]) with the addresses to be used for staking
- Users will need to approve the contract to spend the staking token
- Users can call stake(address) to stake the stakeAmount of the staking token and receive 1 NFT
- Users can stake as many times as they want until the drawing time
- After the drawing time, call getRandomNumber() as many times as there are winners
- Callers of getRandomNumber() must wait until the Chainlink VRF responds before creating the next request
- When random numbers are received, winners are announced via an event
- Winners can also be seen by calling winners()
- When all winners are selected, users can call unstake() to receive their staking tokens back and collect rewards if they're a winner

## Setup

```
yarn
```

## Test

```
truffle test
```
