pragma solidity ^0.6.0;

contract MockLinkswapFactory {
 mapping(address => mapping(address => address)) public getPair;

 function createPair(address _token0, address _token1, address _lpToken) external {
   getPair[_token0][_token1] = _lpToken;
 }
}
