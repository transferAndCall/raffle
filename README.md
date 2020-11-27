# Raffle

Deployment/usage process:
- Deploy contract with documented parameters set
- Approve contract to spend LINK and the payoutToken for the amount multiplied by the winners
- Call init(address[]) with the addresses to be used for staking
- Users will need to approve the contract to spend the staking token
- Users can call stake(address) to stake the stakeAmount of the staking token and receive 1 NFT
- Users can stake as many times as they want until the drawing time
- After the drawing time, call getRandomNumber()
- If there are more than 1 winners, the response of the VRF node will initiate the next request until all winners are selected
- When random numbers are received, winners are announced via an event
- Winning token IDs can also be seen by calling winners()
- When all winners are selected, users can call unstake() to receive their staking tokens back and collect rewards if they're a winner

## Setup

```
yarn
```

## Test

```
truffle test
```
