// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

contract ArenaRegistry is AccessControl, Pausable {
    using SafeERC20 for IERC20;

    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");
    bytes32 public constant CREATOR_ROLE = keccak256("CREATOR_ROLE");

    uint256 public protocolFeeBps = 275;
    uint256 public creatorFeeBps = 100;
    uint256 public referralFeeBps = 50;
    uint256 public disputeReserveBps = 75;
    uint256 public constant MAX_FEE_BPS = 5000;

    uint256 public creatorBondAmount = 500 * 10**6;
    uint256 public minBet = 1 * 10**6;
    uint256 public maxBet = 100000 * 10**6;

    IERC20 public immutable collateral;
    address public treasury;
    address public beacon;
    address public oracleModule;
    uint256 public treasuryTimelock = 2 days;

    mapping(address => bool) public isMarket;
    mapping(address => bool) public isCreator;
    mapping(address => uint256) public creatorBondLocked;
    mapping(string => address) public marketById;
    mapping(address => bool) public sanctioned;

    event FeesUpdated(uint256 protocol, uint256 creator, uint256 referral, uint256 dispute);
    event CreatorBondUpdated(uint256 newAmount);
    event MarketRegistered(address indexed market, string indexed marketId);
    event TreasuryUpdated(address newTreasury);
    event BeaconUpdated(address newBeacon);
    event OracleModuleUpdated(address newOracleModule);
    event CreatorBondPosted(address indexed creator, uint256 amount);
    event CreatorBondSlashed(address indexed creator, uint256 amount, string reason);
    event CreatorBondReleased(address indexed creator, uint256 amount);

    constructor(address _collateral, address _admin) {
        require(_collateral != address(0), "Registry: zero collateral");
        collateral = IERC20(_collateral);
        treasury = _admin;
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(OPERATOR_ROLE, _admin);
    }

    function setFees(uint256 _p, uint256 _c, uint256 _r, uint256 _d) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_p + _c + _r + _d <= MAX_FEE_BPS, "Registry: max fee");
        protocolFeeBps = _p;
        creatorFeeBps = _c;
        referralFeeBps = _r;
        disputeReserveBps = _d;
        emit FeesUpdated(_p, _c, _r, _d);
    }

    function setTreasury(address _t) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_t != address(0), "Registry: zero treasury");
        treasury = _t;
        emit TreasuryUpdated(_t);
    }

    function setBeacon(address _b) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_b != address(0), "Registry: zero beacon");
        beacon = _b;
        emit BeaconUpdated(_b);
    }

    function setOracleModule(address _o) external onlyRole(DEFAULT_ADMIN_ROLE) {
        oracleModule = _o;
        emit OracleModuleUpdated(_o);
    }

    function registerMarket(address market, string calldata marketId) external onlyRole(OPERATOR_ROLE) {
        require(!isMarket[market], "Registry: exists");
        isMarket[market] = true;
        marketById[marketId] = market;
        emit MarketRegistered(market, marketId);
    }

    function setCreatorStatus(address c, bool status) external onlyRole(OPERATOR_ROLE) {
        isCreator[c] = status;
    }

    function lockCreatorBond(address c, uint256 amount) external onlyRole(OPERATOR_ROLE) {
        creatorBondLocked[c] += amount;
        collateral.safeTransferFrom(c, address(this), amount);
        emit CreatorBondPosted(c, amount);
    }

    function slashCreatorBond(address c, uint256 amount, string calldata reason) external onlyRole(OPERATOR_ROLE) {
        require(amount <= creatorBondLocked[c], "Registry: insufficient");
        creatorBondLocked[c] -= amount;
        collateral.safeTransfer(treasury, amount);
        emit CreatorBondSlashed(c, amount, reason);
    }

    function releaseCreatorBond(address c, uint256 amount) external onlyRole(OPERATOR_ROLE) {
        require(amount <= creatorBondLocked[c], "Registry: insufficient");
        creatorBondLocked[c] -= amount;
        collateral.safeTransfer(c, amount);
        emit CreatorBondReleased(c, amount);
    }

    function setSanctionStatus(address a, bool s) external onlyRole(OPERATOR_ROLE) {
        sanctioned[a] = s;
    }

    function checkSanction(address a) external view returns (bool) {
        return sanctioned[a];
    }

    function totalFeeBps() external view returns (uint256) {
        return protocolFeeBps + creatorFeeBps + referralFeeBps + disputeReserveBps;
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
}
