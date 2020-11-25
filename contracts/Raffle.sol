 pragma solidity 0.6.12;

import "@chainlink/contracts/src/v0.6/interfaces/AggregatorInterface.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "./lib/VRFConsumerBase.sol";
import "./lib/UniformRandomNumber.sol";

/**
 * @title Raffle
 * @notice Disclaimer:
 * !!! This is unaudited code !!!
 * Inspired by PoolTogether
 * https://github.com/pooltogether/pooltogether-pool-contracts/blob/master/contracts/token/Ticket.sol
 * @dev No ownership requirements of this contract. The project running the raffle is responsible for ensuring
 * the contract is funded and getRandomNumber() is called.
 * @dev Deployment/usage process:
 * - Deploy contract with documented parameters set
 * - Approve contract to spend LINK and the payoutToken for the amount multiplied by the winners
 * - Call fund()
 * - Users will need to approve the contract to spend the staking token
 * - Users can call stake() to stake the stakeAmount of the staking token and receive 1 NFT
 * - Users can stake until the drawing time
 * - After the drawing time, call getRandomNumber() as many times as there are winners
 * - Callers of getRandomNumber() must wait until the Chainlink VRF responds before creating the next request
 * - When random numbers are received, winners are announced via an event
 * - Winners can also be seen by calling winners()
 * - When all winners are selected, users can call unstake() to receive their staking tokens back and collect
     rewards if they're a winner
 */
contract Raffle is VRFConsumerBase, ERC721 {
  using SafeERC20 for IERC20;
  using SafeMath for uint256;

  uint256 public immutable stakeAmount;
  uint256 public immutable payoutAmount;
  uint256 public immutable payoutWinners;
  bytes32 public immutable keyHash;
  uint256 public immutable fee;
  address public immutable vrfCoordinator;
  AggregatorInterface public immutable linkUsd;
  IERC20 public immutable stakingToken;
  IERC20 public immutable payoutToken;
  uint256 public immutable drawingTime;
  uint256 public immutable emergencyEnd;

  bool public funded;
  bool internal _request;
  uint256 internal _counter;
  address[] internal _winners;

  mapping(uint256 => bool) public won;

  event Winner(address indexed _selected, uint256 indexed _tokenId);
  event GetRandom(bytes32 _requestId);

  /**
   * @notice Deploys the contract, setting many immutable variables
   * @param _name The name of the Raffle
   * @param _symbol The symbol of the NFT
   * @param _keyHash The keyHash or SAID of the VRF job
   * @param _fee The fee for each VRF request
   * @param _vrfCoordinator The address of the VRFCoordinator
   * @param _link The address of the LINK token
   * @param _linkUsd The address of the LINK/USD feed
   * @param _stakingToken The address of the staking token
   * @param _stakeAmount The amount of staking tokens for one ticket
   * @param _payoutToken The winning payout token address
   * @param _payoutWinners The number of winners in the raffle
   * @param _payoutAmount The amount to pay each winner
   * @param _drawingTime The timestamp of when the drawing should occur
   */
  constructor(
    string memory _name,
    string memory _symbol,
    bytes32 _keyHash,
    uint256 _fee,
    address _vrfCoordinator,
    address _link,
    address _linkUsd,
    address _stakingToken,
    uint256 _stakeAmount,
    address _payoutToken,
    uint256 _payoutWinners,
    uint256 _payoutAmount,
    uint256 _drawingTime
  )
    ERC721(_name, _symbol)
    VRFConsumerBase(_vrfCoordinator, _link)
    public
  {
    require(_drawingTime > block.timestamp, "!drawingTime");
    keyHash = _keyHash;
    fee = _fee;
    vrfCoordinator = _vrfCoordinator;
    linkUsd = AggregatorInterface(_linkUsd);
    stakingToken = IERC20(_stakingToken);
    stakeAmount = _stakeAmount;
    payoutToken = IERC20(_payoutToken);
    payoutWinners = _payoutWinners;
    payoutAmount = _payoutAmount;
    drawingTime = _drawingTime;
    emergencyEnd = _drawingTime.add(1 days);
  }

  /**
   * @notice Funds the contract with the payout token and LINK token
   * @dev This contract must be approved for spending first
   * @dev Cannot be called twice but tokens can be manually sent to the contract
   * in case something goes wrong. However, these tokens will be unrecoverable.
   */
  function fund() external {
    require(!funded, "funded");
    payoutToken.safeTransferFrom(msg.sender, address(this), payoutAmount.mul(payoutWinners));
    LINK.transferFrom(msg.sender, address(this), fee.mul(payoutWinners));
    funded = true;
  }

  /**
   * @notice Issues a NFT representing a lottery ticket
   * @notice Cost of a ticket is determined by the stakeAmount
   * @dev This contract must be approved for spending first
   * @dev Cannot be called after the lottery drawing has passed
   */
  function stake() external {
    require(funded, "!funded");
    require(block.timestamp < drawingTime, "ended");
    _safeMint(msg.sender, ++_counter);
    stakingToken.safeTransferFrom(msg.sender, address(this), stakeAmount);
  }

  /**
   * @notice Recovers the staked LP tokens
   * @dev Loops through all the tickets, this can get expensive if
   * a user has many.
   * @dev In case something goes wrong, users can unstake after the emergencyEnd time
   */
  function unstake() external {
    require(_winners.length >= payoutWinners || block.timestamp > emergencyEnd, "!ended");
    uint256 balance = balanceOf(msg.sender);
    require(balance > 0, "!staked");
    for (uint i = 0; i < balance; i++) {
      uint256 token = tokenOfOwnerByIndex(msg.sender, i);
      if (won[token]) {
        payoutToken.safeTransfer(msg.sender, payoutAmount);
      }
      stakingToken.safeTransfer(msg.sender, stakeAmount);
    }
  }

  /**
   * @notice Requests a random number from the Chainlink VRF
   * @dev Has a mutex to prevent calling the function multiple times before
   * the Chainlink node has a chance to respond.
   */
  function getRandomNumber() external {
    require(block.timestamp >= drawingTime, "!drawingTime");
    require(_winners.length < payoutWinners, "!winners");
    require(!_request, "request");
    _request = true;
    // use the LINK/USD price feed as the seed for randomness
    bytes32 requestId = requestRandomness(keyHash, fee, uint256(linkUsd.latestAnswer()));
    emit GetRandom(requestId);
  }

  /**
   * @notice Get the winning addresses at the time of the drawing
   * @dev Tickets can still be traded after drawing
   */
  function winners() external view returns (address[] memory) {
    return _winners;
  }

  function fulfillRandomness(bytes32, uint256 _randomNumber) internal override {
    uint256 token = UniformRandomNumber.uniform(_randomNumber, totalSupply());
    _request = false;
    if (token != 0) {
      won[token] = true;
      address selected = ownerOf(token);
      _winners.push(selected);
      emit Winner(selected, token);
    }
  }
}
