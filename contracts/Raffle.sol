 pragma solidity 0.6.12;

import "@chainlink/contracts/src/v0.6/interfaces/AggregatorInterface.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "./lib/VRFConsumerBase.sol";
import "./ILinkswapFactory.sol";
import "./ILinkswapPair.sol";

/**
 * @title Raffle
 * @notice This contract mints an NFT as a raffle ticket for each address that stakes to it. Each day, a winner is selected from the previous day, which utilizes Chainlink's VRF to select the winning token ID. Winners collect YFL as a prize and optionally a sponsor token payout as well.
 * @notice Disclaimer: !!! This is unaudited code !!!
 * @dev No ownership requirements of this contract. The project running the raffle is responsible for ensuring the contract is funded and the final getRandomNumber() is called. Once the contract is initialized, funds cannot be pulled out except by participants.
 * @dev Deployment/usage process:
 * - Deploy contract with documented parameters set
 * - Approve contract to spend LINK and YFL for the amount multiplied by the number of days
 * - Optionally you can simply send LINK and YFL directly to the contract
 * - Call init(address[],address[],uint256[]) with the addresses to be used for staking (the LP tokens), the addresses to be used for any sponsor payouts for that day, and the amount of sponsor payouts
 * - At this point, the contract is simply waiting for the start time to pass
 * - Users will need to approve the contract to spend the staking token
 * - Users can call stake(address) to stake the stakeAmount of the staking token and receive 1 NFT
 * - Users can stake as many times as they want until the drawing time for that day
 * - The first to stake on the next day creates the randomness request for the previous day
 * - When random numbers are received, winners are announced via an event
 * - Winning tokenIDs can also be seen by calling winners()
 * - When the day has ended, users can call unstake() to receive their staking tokens back and collect rewards if they're a winner
 * - The process of staking and getting a random number repeats for as many days of the raffle
 * - After the last day, someone must call getRandomNumber() one final time to select the last day's winner
 */
contract Raffle is VRFConsumerBase, ERC721 {
  using SafeERC20 for IERC20;
  using SafeMath for uint256;

  uint256 public immutable stakeAmount;
  uint256 public immutable stakeCap;
  uint256 public immutable prizeAmount;
  bytes32 public immutable keyHash;
  uint256 public immutable fee;
  address public immutable vrfCoordinator;
  AggregatorInterface public immutable linkUsd;
  IERC20 public immutable YFL;
  ILinkswapFactory public immutable linkswapFactory;
  uint256 public immutable startTime;
  uint256 public immutable activeDays;
  uint256 public immutable drawingTime;

  bool public initialized;
  uint256 internal _counter;
  uint256[] internal _winners;

  struct Stake {
    bool claimed;
    bool won;
    address stakingToken;
    uint256 day;
  }

  struct Randomness {
    bytes32 requestId;
    bool answered;
  }

  struct Day {
    address stakingToken;
    address payoutToken;
    uint256 payoutAmount;
    uint256 lastTokenId;
  }

  mapping(uint256 => uint256) internal _lastTokenInEpoch;
  mapping(uint256 => Stake) internal _staked;
  mapping(uint256 => Randomness) internal _randomnessRequest;
  mapping(uint256 => Day) internal _day;

  event Winner(address indexed _selected, uint256 indexed _tokenId);
  event GetRandom(bytes32 _requestId);

  /**
   * @notice Deploys the contract, setting many immutable variables
   * @param _name The name of the Raffle
   * @param _symbol The symbol of the NFT
   * @param _baseURI The base URI of the NFT
   * @param _keyHash The keyHash or SAID of the VRF job
   * @param _fee The fee for each VRF request
   * @param _vrfCoordinator The address of the VRFCoordinator
   * @param _link The address of the LINK token
   * @param _linkUsd The address of the LINK/USD feed
   * @param _linkswapFactory The address of the LINKSWAP Factory contract
   * @param _stakeAmount The amount of staking tokens for one ticket
   * @param _stakeCap The maximum number of times an address can stake (0 for no cap)
   * @param _YFL The winning payout token address
   * @param _prizeAmount The amount to pay each winner
   * @param _startTime The timestamp of when the raffle should start
   * @param _days The number of days the raffle will last
   */
  constructor(
    string memory _name,
    string memory _symbol,
    string memory _baseURI,
    bytes32 _keyHash,
    uint256 _fee,
    address _vrfCoordinator,
    address _link,
    address _linkUsd,
    address _linkswapFactory,
    uint256 _stakeAmount,
    uint256 _stakeCap,
    address _YFL,
    uint256 _prizeAmount,
    uint256 _startTime,
    uint256 _days
  )
    ERC721(_name, _symbol)
    VRFConsumerBase(_vrfCoordinator, _link)
    public
  {
    require(_startTime > block.timestamp, "!_startTime");
    _setBaseURI(_baseURI);
    keyHash = _keyHash;
    fee = _fee;
    vrfCoordinator = _vrfCoordinator;
    linkUsd = AggregatorInterface(_linkUsd);
    linkswapFactory = ILinkswapFactory(_linkswapFactory);
    stakeAmount = _stakeAmount;
    stakeCap = _stakeCap;
    YFL = IERC20(_YFL);
    prizeAmount = _prizeAmount;
    startTime = _startTime;
    activeDays = _days;
    uint256 _drawingTime = _startTime.add(_days.mul(1 days));
    drawingTime = _drawingTime;
  }

  /**
   * @notice Funds the contract with the payout token and LINK token and sets the staking tokens
   * @dev If not already funded, this contract must be approved for spending first
   * @dev Cannot be called twice but tokens can be manually sent to the contract
   * in case something goes wrong. However, these tokens will be unrecoverable.
   * @param _stakingTokens The addresses of the staking tokens
   * @param _payoutTokens The addresses of the payout tokens (0 address for none)
   * @param _payoutAmounts The amount of payout for the payout tokens
   */
  function init(
    address[] memory _stakingTokens,
    address[] memory _payoutTokens,
    uint256[] memory _payoutAmounts
  )
    external
  {
    require(!initialized, "initialized");
    require(_stakingTokens.length == _payoutTokens.length
        && _payoutTokens.length == _payoutAmounts.length, "!length");
    require(_stakingTokens.length <= activeDays, "!_stakingTokens");
    // ensure contract is funded with YFL
    if (YFL.balanceOf(address(this)) < prizeAmount.mul(activeDays)) {
      YFL.safeTransferFrom(msg.sender, address(this), prizeAmount.mul(activeDays));
    }
    // ensure the contract is funded with LINK
    if (LINK.balanceOf(address(this)) < fee.mul(activeDays)) {
      LINK.transferFrom(msg.sender, address(this), fee.mul(activeDays));
    }
    for (uint i = 0; i < _stakingTokens.length; i++) {
      _day[i] = Day(_stakingTokens[i], _payoutTokens[i], _payoutAmounts[i], 0);
      // ensure the contract is funded with any specific payout tokens
      // initializer will have to be careful if the same payout token is used twice
      if (_payoutTokens[i] != address(0) &&
        IERC20(_payoutTokens[i]).balanceOf(address(this)) < _payoutAmounts[i]) {
        IERC20(_payoutTokens[i]).transferFrom(msg.sender, address(this), _payoutAmounts[i]);
      }
    }
    initialized = true;
  }

  /**
   * @notice Returns the current day (starts at 0)
   * @dev reverts if the raffle has not started
   */
  function currentDay() public view returns (uint256) {
    require(block.timestamp > startTime, "!startTime");
    return block.timestamp.sub(startTime).div(1 days);
  }

  /**
   * @notice Returns the address of the current accepted staking token
   * @dev The day's staking token can be the 0 address, which means
   * that any LP token of LINKSWAP would be accepted for staking
   */
  function currentStakingToken() public view returns (address) {
    return _day[currentDay()].stakingToken;
  }

  /**
   * @notice Issues a NFT representing a lottery ticket to the caller
   * @notice Cost of a ticket is determined by the stakeAmount
   * @dev This contract must be approved for spending first
   * @dev Cannot be called after the lottery drawing has passed
   * @param _stakingToken The LINKSWAP staking token address
   */
  function stake(address _stakingToken) external {
    require(initialized, "!initialized");
    require(block.timestamp < drawingTime, "ended");
    require(balanceOf(msg.sender) < stakeCap || stakeCap == 0, "stakeCap");
    address lpToken = currentStakingToken();
    require(lpToken == _stakingToken || lpToken == address(0), "!currentStakingToken");
    if (lpToken == address(0)) {
      // check to make sure the staking token is a LINKSWAP LP token
      address token0 = ILinkswapPair(_stakingToken).token0();
      address token1 = ILinkswapPair(_stakingToken).token1();
      require(linkswapFactory.getPair(token0, token1) == _stakingToken, "!_stakingToken");
    }
    uint256 token = _counter++;
    _lastTokenInEpoch[currentDay()] = token;
    _safeMint(msg.sender, token);
    _setTokenURI(token, Strings.toString(token));
    _staked[token] = Stake(false, false, _stakingToken, currentDay());
    if (canGetRandomNumber()) {
      getRandomNumber();
    }
    IERC20(_stakingToken).safeTransferFrom(msg.sender, address(this), stakeAmount);
  }

  /**
   * @notice Recovers the staked LP tokens
   * @notice If caller holds a winning tokenID, this will send them their YFL prize
   * and any sponsor payout tokens
   * @dev Loops through all the tickets, this can get expensive if a user has many
   */
  function unstake() external {
    require(_randomnessRequest[currentDay().sub(1)].answered, "!answered");
    uint256 balance = balanceOf(msg.sender);
    require(balance > 0, "!staked");
    for (uint i = 0; i < balance; i++) {
      uint256 token = tokenOfOwnerByIndex(msg.sender, i);
      Stake memory staked = _staked[token];
      // if unclaimed and we've passed beyond the drawing's day
      if (!staked.claimed && staked.day < currentDay()) {
        _staked[token].claimed = true;
        // if caller is a winner
        if (staked.won) {
          // send them YFL
          YFL.safeTransfer(msg.sender, prizeAmount);
          address payoutToken = _day[staked.day].payoutToken;
          // if there's an additional payout token
          if (payoutToken != address(0)) {
            // send them the payout token
            IERC20(payoutToken).safeTransfer(msg.sender, _day[staked.day].payoutAmount);
          }
        }
        // send them their staking token back
        IERC20(staked.stakingToken).safeTransfer(msg.sender, stakeAmount);
      }
    }
  }

  /**
   * @notice Get the winning token IDs
   */
  function winners() external view returns (uint256[] memory) {
    return _winners;
  }

  /**
   * @notice Requests a random number from the Chainlink VRF
   * @dev Has a mutex to prevent calling the function multiple times before
   * the Chainlink node has a chance to respond.
   */
  function getRandomNumber() public {
    require(canGetRandomNumber(), "!canGetRandomNumber");
    // use the LINK/USD price feed as the seed for randomness
    bytes32 requestId = requestRandomness(keyHash, fee, uint256(linkUsd.latestAnswer()));
    _randomnessRequest[currentDay().sub(1)] = Randomness(requestId, false);
    emit GetRandom(requestId);
  }

  /**
   * @notice Determines whether a request can be made for randomness
   * @return bool if a request can be made
   */
  function canGetRandomNumber() public view returns (bool) {
    if (currentDay() == 0) {
      return false;
    } else {
      return _randomnessRequest[currentDay().sub(1)].requestId == bytes32(0);
    }
  }

  function fulfillRandomness(bytes32, uint256 _randomNumber) internal override {
    uint256 current = currentDay();
    _randomnessRequest[current.sub(1)].answered = true;
    uint256 min;
    uint256 max;
    // special case for day 0
    if (current == 1) {
      min = 0;
      max = _lastTokenInEpoch[0];
    // special case for the last day
    } else if (current == activeDays) {
      min = _lastTokenInEpoch[current.sub(1)];
      max = totalSupply();
    // all other days
    } else {
      min = _lastTokenInEpoch[current.sub(2)];
      max = _lastTokenInEpoch[current.sub(1)];
    }
    uint256 token = (_randomNumber % max.sub(min)).add(min);
    _staked[token].won = true;
    address winner = ownerOf(token);
    _winners.push(token);
    emit Winner(winner, token);
  }
}
