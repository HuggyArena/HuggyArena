// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IRegistry {
    function collateral() external view returns (IERC20);
    function treasury() external view returns (address);
    function protocolFeeBps() external view returns (uint256);
    function creatorFeeBps() external view returns (uint256);
    function referralFeeBps() external view returns (uint256);
    function disputeReserveBps() external view returns (uint256);
    function totalFeeBps() external view returns (uint256);
    function minBet() external view returns (uint256);
    function maxBet() external view returns (uint256);
    function challengeBondAmount() external view returns (uint256);
    function checkSanction(address) external view returns (bool);
    function hasRole(bytes32, address) external view returns (bool);
    function ORACLE_ROLE() external view returns (bytes32);
    function OPERATOR_ROLE() external view returns (bytes32);
    function paused() external view returns (bool);
}
