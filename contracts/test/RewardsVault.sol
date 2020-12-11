pragma solidity ^0.6.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract RewardsVault {
  address public immutable token;

  mapping(address => uint256) public balanceOf;

  constructor(address _token) public {
    token = _token;
  }

  function deposit(uint256 _amount) public {
    IERC20(token).transferFrom(msg.sender, address(this), _amount);
    balanceOf[msg.sender] += _amount;
  }
}
