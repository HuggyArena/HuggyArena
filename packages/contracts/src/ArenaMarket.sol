// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {EIP712Upgradeable} from "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IRegistry} from "./IRegistry.sol";

contract ArenaMarket is Initializable, ReentrancyGuard, EIP712Upgradeable, PausableUpgradeable {
    using SafeERC20 for IERC20;

    enum MarketState { PENDING_APPROVAL, OPEN, CLOSED, PROPOSED, CHALLENGED, FINALIZED, VOIDED }

    struct MarketParams {
        string marketId;
        string ipfsHash;
        bytes32 sourcePrimary;
        bytes32 sourceFallback;
        bytes32 tieRule;
        bytes32 voidRule;
        uint256 openTime;
        uint256 closeTime;
        uint256 resolveTime;
        uint256 challengeWindowSeconds;
    }

    bytes32 public constant BET_TYPEHASH = keccak256(
        "Bet(address market,address user,bytes32 outcome,uint256 amount,uint256 nonce,uint256 deadline)"
    );

    IRegistry public registry;
    MarketParams public params;
    address public creator;
    address public referrer;
    MarketState public state;

    bytes32[] public outcomes;
    mapping(bytes32 => bool) public isValidOutcome;
    mapping(bytes32 => uint256) public outcomePools;
    mapping(address => mapping(bytes32 => uint256)) public userStakes;
    mapping(address => mapping(uint256 => bool)) public nonceUsed;
    mapping(address => bool) public hasClaimed;

    uint256 public totalPool;
    uint256 public distributablePool;
    bool public feesCollected;
    bytes32 public winningOutcome;
    uint256 public finalizedAt;
    bytes32 public resolutionHash;

    // Challenge bond state (#1)
    address public challenger;
    uint256 public challengeBond;

    // Claim dust-prevention tracking (#4)
    uint256 public totalClaimed;
    uint256 public totalWinningStakeClaimed;

    // Fee BPS snapshot at market creation (#21)
    uint256 public feeBpsSnapshot;

    // Per-market collateral token — allows yield-bearing assets (wstETH, rETH, aUSDC, etc.)
    // Set during initialize(); must be whitelisted in the registry.
    IERC20 public marketCollateral;

    // Storage gap — must remain the last storage variable for upgrade safety.
    // New variables in future versions must be appended BEFORE this line.
    uint256[49] private __gap;

    event MarketInitialized(string indexed marketId, address indexed creator);
    event MarketApproved(address indexed approver);
    event BetPlaced(address indexed user, bytes32 indexed outcome, uint256 amount, uint256 newTotal, uint256 feeBpsAtBet);
    event MarketClosed(uint256 timestamp);
    event ResolutionProposed(bytes32 indexed outcome, bytes32 indexed evidenceHash);
    event ResolutionChallenged(address indexed challenger, bytes32 reason, uint256 bond);
    event MarketFinalized(bytes32 indexed winningOutcome, uint256 payoutPool);
    event MarketVoided(string reason);
    event ClaimExecuted(address indexed user, uint256 amount);
    event FeesDistributed(uint256 protocol, uint256 creatorFee, uint256 referralFee, uint256 reserve);

    modifier onlyState(MarketState expected) {
        require(state == expected, "Market: invalid state");
        _;
    }

    modifier onlyOracle() {
        require(registry.hasRole(registry.ORACLE_ROLE(), msg.sender), "Market: not oracle");
        _;
    }

    constructor() {
        _disableInitializers();
    }

    function initialize(
        address registryAddress,
        MarketParams calldata marketParams,
        bytes32[] calldata marketOutcomes,
        address marketCreator,
        address marketReferrer,
        address collateralToken
    ) external initializer {
        require(registryAddress != address(0), "Market: zero registry");
        require(marketCreator != address(0), "Market: zero creator");
        require(marketOutcomes.length >= 2 && marketOutcomes.length <= 10, "Market: outcomes");
        require(marketParams.openTime < marketParams.closeTime, "Market: bad open/close");
        require(marketParams.closeTime <= marketParams.resolveTime, "Market: bad close/resolve");

        // Resolve collateral: use override if provided, else fall back to registry default.
        address resolvedCollateral = collateralToken != address(0)
            ? collateralToken
            : address(IRegistry(registryAddress).collateral());
        require(
            IRegistry(registryAddress).isWhitelistedCollateral(resolvedCollateral),
            "Market: collateral not whitelisted"
        );

        __EIP712_init("ArenaMarket", "1");
        __Pausable_init();

        registry = IRegistry(registryAddress);
        marketCollateral = IERC20(resolvedCollateral);
        params = marketParams;
        creator = marketCreator;
        referrer = marketReferrer;
        state = MarketState.PENDING_APPROVAL;
        feeBpsSnapshot = IRegistry(registryAddress).totalFeeBps();

        for (uint256 i = 0; i < marketOutcomes.length; i++) {
            require(marketOutcomes[i] != bytes32(0), "Market: zero outcome");
            outcomes.push(marketOutcomes[i]);
            isValidOutcome[marketOutcomes[i]] = true;
        }

        _pause();
        emit MarketInitialized(marketParams.marketId, marketCreator);
    }

    function approveMarket() external onlyOracle onlyState(MarketState.PENDING_APPROVAL) {
        state = MarketState.OPEN;
        _unpause();
        emit MarketApproved(msg.sender);
    }

    function placeBet(bytes32 outcome, uint256 amount, uint256 nonce, uint256 deadline, bytes calldata sig)
        external
        nonReentrant
        whenNotPaused
        onlyState(MarketState.OPEN)
    {
        require(!registry.paused(), "Market: registry paused");
        require(block.timestamp >= params.openTime && block.timestamp < params.closeTime, "Market: timing");
        require(block.timestamp <= deadline, "Market: signature expired");
        require(deadline <= block.timestamp + 300, "Market: deadline too far");
        require(isValidOutcome[outcome], "Market: invalid outcome");
        require(amount >= registry.minBet() && amount <= registry.maxBet(), "Market: amount out of range");
        require(!registry.checkSanction(msg.sender), "Market: sanctioned");
        require(!nonceUsed[msg.sender][nonce], "Market: nonce used");

        if (msg.sender == creator) {
            // Cap creator stake at 10% of the pre-bet pool. The check is skipped on an
            // empty market so the creator can seed initial liquidity.
            if (totalPool > 0) {
                uint256 newStake = userStakes[msg.sender][outcome] + amount;
                require(newStake <= totalPool / 10, "Market: creator cap");
            }
        }

        bytes32 structHash = keccak256(abi.encode(BET_TYPEHASH, address(this), msg.sender, outcome, amount, nonce, deadline));
        bytes32 digest = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(digest, sig);
        require(registry.hasRole(registry.ORACLE_ROLE(), signer), "Market: invalid sig");

        nonceUsed[msg.sender][nonce] = true;

        marketCollateral.safeTransferFrom(msg.sender, address(this), amount);

        userStakes[msg.sender][outcome] += amount;
        outcomePools[outcome] += amount;
        totalPool += amount;

        emit BetPlaced(msg.sender, outcome, amount, totalPool, registry.totalFeeBps());
    }

    function closeMarket() external onlyState(MarketState.OPEN) {
        bool authorized = msg.sender == creator || registry.hasRole(registry.ORACLE_ROLE(), msg.sender) || registry.hasRole(registry.OPERATOR_ROLE(), msg.sender);
        require(authorized, "Market: auth");
        require(block.timestamp >= params.closeTime || registry.hasRole(registry.OPERATOR_ROLE(), msg.sender), "Market: early");
        state = MarketState.CLOSED;
        _pause();
        emit MarketClosed(block.timestamp);
    }

    function proposeResolution(bytes32 outcome, bytes32 evidenceHash) external onlyOracle onlyState(MarketState.CLOSED) {
        require(isValidOutcome[outcome], "Market: invalid outcome");
        require(block.timestamp >= params.resolveTime, "Market: early");
        winningOutcome = outcome;
        resolutionHash = evidenceHash;
        state = MarketState.PROPOSED;
        emit ResolutionProposed(outcome, evidenceHash);
    }

    function challengeResolution(bytes32 reason) external onlyState(MarketState.PROPOSED) {
        require(block.timestamp < params.resolveTime + params.challengeWindowSeconds, "Market: challenge window closed");
        require(msg.sender != creator, "Market: creator cannot challenge");

        uint256 bond = registry.challengeBondAmount();
        require(bond > 0, "Market: zero challenge bond");

        challenger = msg.sender;
        challengeBond = bond;
        marketCollateral.safeTransferFrom(msg.sender, address(this), bond);

        state = MarketState.CHALLENGED;
        emit ResolutionChallenged(msg.sender, reason, bond);
    }

    function finalizeResolution() external onlyOracle {
        require(state == MarketState.PROPOSED || state == MarketState.CHALLENGED, "Market: not ready");
        // When CHALLENGED the caller must hold both ORACLE_ROLE (enforced by the modifier above)
        // and OPERATOR_ROLE — a deliberate dual-key requirement for disputed markets.
        if (state == MarketState.CHALLENGED) {
            require(registry.hasRole(registry.OPERATOR_ROLE(), msg.sender), "Market: challenged requires operator");
            // Challenger's bond is slashed to treasury: the challenge did not prevent resolution.
            if (challengeBond > 0) {
                uint256 slashAmount = challengeBond;
                challengeBond = 0;
                marketCollateral.safeTransfer(registry.treasury(), slashAmount);
            }
        }
        if (!feesCollected) {
            _collectFees();
        }
        state = MarketState.FINALIZED;
        finalizedAt = block.timestamp;
        emit MarketFinalized(winningOutcome, distributablePool);
    }

    function voidMarket(string calldata reason) external onlyOracle {
        require(state != MarketState.FINALIZED, "Market: finalized");
        require(!feesCollected, "Market: fees collected");
        // Refund challenge bond if one exists; the challenger correctly flagged a bad resolution.
        if (challengeBond > 0) {
            uint256 refundAmount = challengeBond;
            challengeBond = 0;
            marketCollateral.safeTransfer(challenger, refundAmount);
        }
        state = MarketState.VOIDED;
        emit MarketVoided(reason);
    }

    function claim() external nonReentrant onlyState(MarketState.FINALIZED) {
        require(!hasClaimed[msg.sender], "Market: claimed");
        uint256 stake = userStakes[msg.sender][winningOutcome];
        require(stake > 0, "Market: no stake");
        uint256 winningPool = outcomePools[winningOutcome];
        require(winningPool > 0, "Market: zero winning pool");

        hasClaimed[msg.sender] = true;
        totalWinningStakeClaimed += stake;

        uint256 payout;
        if (totalWinningStakeClaimed == winningPool) {
            // Last claimer: pay remaining pool to prevent dust being permanently locked.
            payout = distributablePool - totalClaimed;
        } else {
            payout = (stake * distributablePool) / winningPool;
        }
        totalClaimed += payout;

        marketCollateral.safeTransfer(msg.sender, payout);
        emit ClaimExecuted(msg.sender, payout);
    }

    function refund() external nonReentrant onlyState(MarketState.VOIDED) {
        uint256 totalRefund;
        for (uint256 i = 0; i < outcomes.length; i++) {
            bytes32 outcome = outcomes[i];
            uint256 stake = userStakes[msg.sender][outcome];
            if (stake > 0) {
                totalRefund += stake;
                userStakes[msg.sender][outcome] = 0;
            }
        }
        require(totalRefund > 0, "Market: no stake");
        marketCollateral.safeTransfer(msg.sender, totalRefund);
    }

    function getOdds(bytes32 outcome) external view returns (uint256) {
        uint256 poolForOutcome = outcomePools[outcome];
        if (poolForOutcome == 0) return 0;
        // Use fee BPS captured at market creation so odds remain consistent for bettors.
        uint256 poolAfterFees = (totalPool * (10000 - feeBpsSnapshot)) / 10000;
        return (poolAfterFees * 1e18) / poolForOutcome;
    }

    function getCurrentState() external view returns (MarketState) {
        return state;
    }

    function _collectFees() internal {
        uint256 protocol = (totalPool * registry.protocolFeeBps()) / 10000;
        uint256 creatorFee = (totalPool * registry.creatorFeeBps()) / 10000;
        uint256 referralFee = (totalPool * registry.referralFeeBps()) / 10000;
        uint256 reserve = (totalPool * registry.disputeReserveBps()) / 10000;

        distributablePool = totalPool - protocol - creatorFee - referralFee - reserve;

        marketCollateral.safeTransfer(registry.treasury(), protocol + reserve);
        marketCollateral.safeTransfer(creator, creatorFee);

        if (referrer != address(0)) {
            marketCollateral.safeTransfer(referrer, referralFee);
        } else {
            marketCollateral.safeTransfer(registry.treasury(), referralFee);
        }

        feesCollected = true;
        emit FeesDistributed(protocol, creatorFee, referralFee, reserve);
    }
}
