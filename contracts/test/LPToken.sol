pragma solidity ^0.6.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract LPToken is ERC20 {
  address public immutable token0;
  address public immutable token1;

  constructor(
    string memory _name,
    string memory _symbol,
    address _token0,
    address _token1
  )
    ERC20(_name, _symbol)
    public
  {
    _mint(msg.sender, 1000 * 1e18);
    token0 = _token0;
    token1 = _token1;
  }
}

