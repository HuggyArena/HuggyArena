// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {ArenaRegistry} from "../src/ArenaRegistry.sol";
import {ArenaMarket} from "../src/ArenaMarket.sol";
import {MockUSDC} from "./helpers/MockUSDC.sol";

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
        market.approveMarket();
        vm.stopPrank();
    }

    function testBetTypehashExists() public view {
        assertTrue(market.BET_TYPEHASH() != bytes32(0));
    }
}
