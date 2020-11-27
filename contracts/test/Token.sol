pragma solidity ^0.6.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract Token is ERC20 {
  constructor(
    string memory _name,
    string memory _symbol
  )
    ERC20(_name, _symbol)
    public
  {
    _mint(msg.sender, 1000 * 1e18);
  }
}
