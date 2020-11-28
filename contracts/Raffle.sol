 pragma solidity 0.6.12;

import "@chainlink/contracts/src/v0.6/interfaces/AggregatorInterface.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "./lib/VRFConsumerBase.sol";

/**
 * @title Raffle
 * @notice Given a prize token and an array of acceptible staking tokens, this contract utilizes
 * Chainlink's VRF to select winners of a raffle.
 * @notice Disclaimer: !!! This is unaudited code !!!
 * @dev No ownership requirements of this contract. The project running the raffle is responsible for ensuring
 * the contract is funded and getRandomNumber() is called.
 * @dev Deployment/usage process:
 * - Deploy contract with documented parameters set
 * - Approve contract to spend LINK and the payoutToken for the amount multiplied by the winners
 * - Call init(address[]) with the addresses to be used for staking
 * - Users will need to approve the contract to spend the staking token
 * - Users can call stake(address) to stake the stakeAmount of the staking token and receive 1 NFT
 * - Users can stake as many times as they want until the drawing time
 * - After the drawing time, call getRandomNumber()
 * - If there are more than 1 winners, the response of the VRF node will initiate the next request until all winners are selected
 * - When random numbers are received, winners are announced via an event
 * - Winners can also be seen by calling winners()
 * - When all winners are selected, users can call unstake() to receive their staking tokens back and collect
     rewards if they're a winner
 */
contract Raffle is VRFConsumerBase, ERC721 {
  using SafeERC20 for IERC20;
  using SafeMath for uint256;

  uint256 public immutable stakeAmount;
  uint256 public immutable stakeCap;
  uint256 public immutable payoutAmount;
  uint256 public immutable payoutWinners;
  bytes32 public immutable keyHash;
  uint256 public immutable fee;
  address public immutable vrfCoordinator;
  AggregatorInterface public immutable linkUsd;
  IERC20 public immutable payoutToken;
  uint256 public immutable drawingTime;
  uint256 public immutable emergencyEnd;

  bool public initialized;
  bool internal _request;
  uint256 internal _counter;
  uint256[] internal _winners;

  mapping(uint256 => bool) public won;
  mapping(address => bool) public stakingToken;
  mapping(uint256 => address) internal _staked;

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
   * @param _stakeAmount The amount of staking tokens for one ticket
   * @param _stakeCap The maximum number of times an address can stake (0 for no cap)
   * @param _payoutToken The winning payout token address
   * @param _payoutWinners The number of winners in the raffle
   * @param _payoutAmount The amount to pay each winner
   * @param _drawingTime The timestamp of when the drawing should occur
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
    uint256 _stakeAmount,
    uint256 _stakeCap,
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
    _setBaseURI(_baseURI);
    keyHash = _keyHash;
    fee = _fee;
    vrfCoordinator = _vrfCoordinator;
    linkUsd = AggregatorInterface(_linkUsd);
    stakeAmount = _stakeAmount;
    stakeCap = _stakeCap;
    payoutToken = IERC20(_payoutToken);
    payoutWinners = _payoutWinners;
    payoutAmount = _payoutAmount;
    drawingTime = _drawingTime;
    emergencyEnd = _drawingTime.add(1 days);
  }

  /**
   * @notice Funds the contract with the payout token and LINK token and sets the staking tokens
   * @dev If not already funded, this contract must be approved for spending first
   * @dev Cannot be called twice but tokens can be manually sent to the contract
   * in case something goes wrong. However, these tokens will be unrecoverable.
   * @param _stakingTokens The addresses of the staking tokens
   */
  function init(address[] memory _stakingTokens) external {
    require(!initialized, "initialized");
    if (payoutToken.balanceOf(address(this)) < payoutAmount.mul(payoutWinners)) {
      payoutToken.safeTransferFrom(msg.sender, address(this), payoutAmount.mul(payoutWinners));
    }
    if (LINK.balanceOf(address(this)) < fee.mul(payoutWinners)) {
      LINK.transferFrom(msg.sender, address(this), fee.mul(payoutWinners));
    }
    for (uint i = 0; i < _stakingTokens.length; i++) {
      stakingToken[_stakingTokens[i]] = true;
    }
    initialized = true;
  }

  /**
   * @notice Issues a NFT representing a lottery ticket
   * @notice Cost of a ticket is determined by the stakeAmount
   * @dev This contract must be approved for spending first
   * @dev Cannot be called after the lottery drawing has passed
   */
  function stake(address _stakingToken) external {
    require(initialized, "!initialized");
    require(stakingToken[_stakingToken], "!stakingToken");
    require(block.timestamp < drawingTime, "ended");
    require(balanceOf(msg.sender) < stakeCap || stakeCap == 0, "stakeCap");
    _safeMint(msg.sender, ++_counter);
    uint256 token = _counter;
    _setTokenURI(token, uint2str(token));
    _staked[token] = _stakingToken;
    IERC20(_stakingToken).safeTransferFrom(msg.sender, address(this), stakeAmount);
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
      IERC20(_staked[token]).safeTransfer(msg.sender, stakeAmount);
    }
  }

  /**
   * @notice Get the winning tokens
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
    _request = true;
    // use the LINK/USD price feed as the seed for randomness
    bytes32 requestId = requestRandomness(keyHash, fee, uint256(linkUsd.latestAnswer()));
    emit GetRandom(requestId);
  }

  /**
   * @notice Determines whether a request can be made for randomness
   * @return bool if a request can be made
   */
  function canGetRandomNumber() public view returns (bool) {
    return block.timestamp >= drawingTime
      && _winners.length < payoutWinners
      && !_request;
  }

  function fulfillRandomness(bytes32, uint256 _randomNumber) internal override {
    _request = false;
    uint256 token = _randomNumber % totalSupply();
    // special case because there is no token 0
    if (token == 0) {
      token = (_randomNumber + 1) % totalSupply();
    }
    won[token] = true;
    address winner = ownerOf(token);
    _winners.push(token);
    emit Winner(winner, token);
    if (_winners.length < payoutWinners && LINK.balanceOf(address(this)) >= fee) {
      getRandomNumber();
    }
  }

  // https://github.com/provable-things/ethereum-api/blob/master/oraclizeAPI_0.5.sol#L1045-L1062
  function uint2str(uint _i) internal pure returns (string memory _uintAsString) {
    if (_i == 0) {
      return "0";
    }
    uint j = _i;
    uint len;
    while (j != 0) {
      len++;
      j /= 10;
    }
    bytes memory bstr = new bytes(len);
    uint k = len - 1;
    while (_i != 0) {
      bstr[k--] = byte(uint8(48 + _i % 10));
      _i /= 10;
    }
    return string(bstr);
  }
}
