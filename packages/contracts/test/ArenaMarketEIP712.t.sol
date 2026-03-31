// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {ArenaRegistry} from "../src/ArenaRegistry.sol";
import {ArenaMarket} from "../src/ArenaMarket.sol";

contract ArenaMarketEIP712Test is Test {
    ArenaRegistry internal registry;
    ArenaMarket internal market;

    address internal admin = address(0xA11CE);
    address internal user = address(0xBEEF);
    uint256 internal oraclePk = 0xA0B0C0;
    address internal oracle;

    bytes32 internal constant OUTCOME_YES = keccak256("YES");
    bytes32 internal constant OUTCOME_NO = keccak256("NO");

    function setUp() public {
        oracle = vm.addr(oraclePk);
        vm.startPrank(admin);
        registry = new ArenaRegistry(address(new MockUSDC()), admin);
        registry.grantRole(registry.ORACLE_ROLE(), oracle);
        market = new ArenaMarket();

        bytes32[] memory outcomes = new bytes32[](2);
        outcomes[0] = OUTCOME_YES;
        outcomes[1] = OUTCOME_NO;

        ArenaMarket.MarketParams memory params = ArenaMarket.MarketParams({
            marketId: "hf-top-test",
            ipfsHash: "ipfs://test",
            sourcePrimary: bytes32("hf"),
            sourceFallback: bytes32("mirror"),
            tieRule: bytes32("void"),
            voidRule: bytes32("void"),
            openTime: block.timestamp,
            closeTime: block.timestamp + 1 days,
            resolveTime: block.timestamp + 2 days,
            challengeWindowSeconds: 1 days
        });

        market.initialize(address(registry), params, outcomes, admin, address(0));
        vm.stopPrank();

        vm.prank(oracle);
        market.approveMarket();
    }

    function testBetTypehashExists() public view {
        assertTrue(market.BET_TYPEHASH() != bytes32(0));
    }

    /// @dev Helper: produce a valid oracle EIP-712 signature for a bet.
    function _signBet(
        address marketAddr,
        address betUser,
        bytes32 outcome,
        uint256 amount,
        uint256 nonce,
        uint256 deadline
    ) internal view returns (bytes memory) {
        bytes32 domainSeparator = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256("ArenaMarket"),
            keccak256("1"),
            block.chainid,
            marketAddr
        ));
        bytes32 structHash = keccak256(abi.encode(
            keccak256("Bet(address market,address user,bytes32 outcome,uint256 amount,uint256 nonce,uint256 deadline)"),
            marketAddr,
            betUser,
            outcome,
            amount,
            nonce,
            deadline
        ));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(oraclePk, digest);
        return abi.encodePacked(r, s, v);
    }

    /// @dev A signature with an expired deadline must be rejected.
    function testExpiredDeadlineRejected() public {
        uint256 amount = 1_000_000;
        uint256 nonce = 1;
        uint256 deadline = block.timestamp - 1; // already expired

        bytes memory sig = _signBet(address(market), user, OUTCOME_YES, amount, nonce, deadline);

        vm.prank(user);
        vm.expectRevert("Market: signature expired");
        market.placeBet(OUTCOME_YES, amount, nonce, deadline, sig);
    }

    /// @dev Reusing a nonce after a successful bet must be rejected.
    function testNonceReuseRejected() public {
        uint256 amount = 1_000_000;
        uint256 nonce = 42;
        uint256 deadline = block.timestamp + 200;

        bytes memory sig = _signBet(address(market), user, OUTCOME_YES, amount, nonce, deadline);

        // First bet succeeds.
        vm.prank(user);
        market.placeBet(OUTCOME_YES, amount, nonce, deadline, sig);

        // Second bet with the same nonce must fail.
        vm.prank(user);
        vm.expectRevert("Market: nonce used");
        market.placeBet(OUTCOME_YES, amount, nonce, deadline, sig);
    }

    /// @dev A signature scoped to market A must not be accepted on market B (cross-market replay).
    function testCrossMarketReplayRejected() public {
        // Deploy a second market with the same parameters.
        bytes32[] memory outcomes = new bytes32[](2);
        outcomes[0] = OUTCOME_YES;
        outcomes[1] = OUTCOME_NO;

        ArenaMarket.MarketParams memory params2 = ArenaMarket.MarketParams({
            marketId: "hf-top-test-2",
            ipfsHash: "ipfs://test2",
            sourcePrimary: bytes32("hf"),
            sourceFallback: bytes32("mirror"),
            tieRule: bytes32("void"),
            voidRule: bytes32("void"),
            openTime: block.timestamp,
            closeTime: block.timestamp + 1 days,
            resolveTime: block.timestamp + 2 days,
            challengeWindowSeconds: 1 days
        });

        ArenaMarket market2 = new ArenaMarket();
        market2.initialize(address(registry), params2, outcomes, admin, address(0));
        vm.prank(oracle);
        market2.approveMarket();

        uint256 amount = 1_000_000;
        uint256 nonce = 1;
        uint256 deadline = block.timestamp + 200;

        // Signature is scoped to `market` (market A).
        bytes memory sig = _signBet(address(market), user, OUTCOME_YES, amount, nonce, deadline);

        // Using the market-A signature on market B must fail because the EIP-712 domain
        // includes verifyingContract, making cross-market replay impossible.
        vm.prank(user);
        vm.expectRevert("Market: invalid sig");
        market2.placeBet(OUTCOME_YES, amount, nonce, deadline, sig);
    }
}

contract MockUSDC {
    string public name = "Mock USDC";
    string public symbol = "mUSDC";
    uint8 public decimals = 6;

    function transferFrom(address, address, uint256) external pure returns (bool) {
        return true;
    }

    function transfer(address, uint256) external pure returns (bool) {
        return true;
    }

    function allowance(address, address) external pure returns (uint256) {
        return type(uint256).max;
    }
}
