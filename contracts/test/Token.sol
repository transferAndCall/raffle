pragma solidity ^0.6.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract Token is ERC20 {
  constructor() ERC20("Token", "LPT") public {
    _mint(msg.sender, 1000 * 1e18);
  }
}
