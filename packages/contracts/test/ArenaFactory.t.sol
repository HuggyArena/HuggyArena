// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {ArenaFactory} from "../src/ArenaFactory.sol";
import {ArenaRegistry} from "../src/ArenaRegistry.sol";
import {ArenaMarket} from "../src/ArenaMarket.sol";
import {MockUSDC} from "./helpers/MockUSDC.sol";

contract ArenaFactoryTest is Test {
    ArenaRegistry internal registry;
    ArenaFactory internal factory;
    ArenaMarket internal implementation;
    MockUSDC internal usdc;

    address internal admin = address(0xA11CE);
    address internal oracle = address(0x0A11CE);
    address internal creator = address(0xC0DE);
    address internal referrer = address(0xFEED);

    bytes32 internal constant OUTCOME_YES = keccak256("YES");
    bytes32 internal constant OUTCOME_NO = keccak256("NO");

    function setUp() public {
        usdc = new MockUSDC();

        vm.startPrank(admin);
        registry = new ArenaRegistry(address(usdc), admin);
        registry.grantRole(registry.ORACLE_ROLE(), oracle);
        registry.grantRole(registry.OPERATOR_ROLE(), admin);

        implementation = new ArenaMarket();
        factory = new ArenaFactory(address(registry), address(implementation));

        // Grant the factory operator rights so it can call registerMarket
        registry.grantRole(registry.OPERATOR_ROLE(), address(factory));

        // Approve creator
        registry.setCreatorStatus(creator, true);
        vm.stopPrank();
    }

    // ─── Constructor ─────────────────────────────────────────────────────────

    function testRegistrySet() public view {
        assertEq(address(factory.registry()), address(registry));
    }

    function testBeaconDeployed() public view {
        assertTrue(address(factory.beacon()) != address(0));
    }

    function testAdminRoleGrantedToDeployer() public view {
        assertTrue(factory.hasRole(factory.DEFAULT_ADMIN_ROLE(), admin));
    }

    // ─── createMarket ─────────────────────────────────────────────────────────

    function _defaultParams() internal view returns (ArenaMarket.MarketParams memory) {
        return ArenaMarket.MarketParams({
            marketId: "factory-test-1",
            ipfsHash: "ipfs://factory-test",
            sourcePrimary: bytes32("hf"),
            sourceFallback: bytes32("mirror"),
            tieRule: bytes32("void"),
            voidRule: bytes32("void"),
            openTime: block.timestamp,
            closeTime: block.timestamp + 1 days,
            resolveTime: block.timestamp + 2 days,
            challengeWindowSeconds: 1 days
        });
    }

    function _defaultOutcomes() internal pure returns (bytes32[] memory outcomes) {
        outcomes = new bytes32[](2);
        outcomes[0] = OUTCOME_YES;
        outcomes[1] = OUTCOME_NO;
    }

    function testCreateMarketSuccess() public {
        uint256 bond = registry.creatorBondAmount();
        usdc.mint(creator, bond);
        vm.prank(creator);
        usdc.approve(address(registry), bond);

        vm.prank(creator);
        address proxy = factory.createMarket(_defaultParams(), _defaultOutcomes(), referrer, 0, address(0));
        assertTrue(proxy != address(0));
        assertTrue(registry.isMarket(proxy));
    }

    function testCreateMarketEmitsEvent() public {
        uint256 bond = registry.creatorBondAmount();
        usdc.mint(creator, bond);
        vm.prank(creator);
        usdc.approve(address(registry), bond);

        vm.prank(creator);
        vm.expectEmit(false, true, true, false);
        emit ArenaFactory.MarketCreated(address(0), "factory-test-1", creator, referrer);
        factory.createMarket(_defaultParams(), _defaultOutcomes(), referrer, 0, address(0));
    }

    function testCreateMarketRegistersById() public {
        uint256 bond = registry.creatorBondAmount();
        usdc.mint(creator, bond);
        vm.prank(creator);
        usdc.approve(address(registry), bond);

        vm.prank(creator);
        address proxy = factory.createMarket(_defaultParams(), _defaultOutcomes(), referrer, 0, address(0));
        assertEq(registry.marketById("factory-test-1"), proxy);
    }

    function testCreateMarketRevertsIfNotCreator() public {
        address nobody = address(0xDEAD);
        vm.prank(nobody);
        vm.expectRevert("Factory: bond");
        factory.createMarket(_defaultParams(), _defaultOutcomes(), referrer, 0, address(0));
    }

    function testCreateMarketWithInitialLiquidity() public {
        uint256 bond = registry.creatorBondAmount();
        uint256 liquidity = 1000 * 10 ** 6;
        usdc.mint(creator, bond + liquidity);
        vm.prank(creator);
        usdc.approve(address(factory), liquidity);
        vm.prank(creator);
        usdc.approve(address(registry), bond);

        vm.prank(creator);
        address proxy = factory.createMarket(_defaultParams(), _defaultOutcomes(), referrer, liquidity, address(0));

        // Liquidity should have been transferred to the proxy
        assertEq(usdc.balanceOf(proxy), liquidity);
    }

    function testCreateMarketWithBondPayment() public {
        // Test the auto-lock path: creator is approved but has no bond locked yet.
        // The factory will call registry.lockCreatorBond, which pulls from the creator.
        address bondedCreator = address(0xB0D);
        uint256 bond = registry.creatorBondAmount();

        // Approve as creator (no bond locked yet)
        vm.prank(admin);
        registry.setCreatorStatus(bondedCreator, true);

        // Fund creator and approve the registry to pull the bond
        usdc.mint(bondedCreator, bond);
        vm.prank(bondedCreator);
        usdc.approve(address(registry), bond);

        ArenaMarket.MarketParams memory params = ArenaMarket.MarketParams({
            marketId: "bonded-market-1",
            ipfsHash: "ipfs://bonded",
            sourcePrimary: bytes32("hf"),
            sourceFallback: bytes32("mirror"),
            tieRule: bytes32("void"),
            voidRule: bytes32("void"),
            openTime: block.timestamp,
            closeTime: block.timestamp + 1 days,
            resolveTime: block.timestamp + 2 days,
            challengeWindowSeconds: 1 days
        });

        vm.prank(bondedCreator);
        address proxy = factory.createMarket(params, _defaultOutcomes(), address(0), 0, address(0));
        assertTrue(proxy != address(0));
        assertEq(registry.creatorBondLocked(bondedCreator), bond);
    }

    // ─── upgradeBeacon ────────────────────────────────────────────────────────

    function testUpgradeBeaconSuccess() public {
        ArenaMarket newImpl = new ArenaMarket();
        vm.prank(admin);
        factory.upgradeBeacon(address(newImpl));
        assertEq(factory.beacon().implementation(), address(newImpl));
    }

    function testUpgradeBeaconRevertsForNonAdmin() public {
        ArenaMarket newImpl = new ArenaMarket();
        vm.prank(creator);
        vm.expectRevert();
        factory.upgradeBeacon(address(newImpl));
    }

    // ─── Multi-collateral support ─────────────────────────────────────────────

    function testCreateMarketWithAltCollateral() public {
        // Deploy an alternate collateral token (simulating wstETH / rETH / aUSDC).
        MockUSDC altToken = new MockUSDC();

        // Whitelist the alternate collateral in the registry.
        vm.prank(admin);
        registry.addCollateral(address(altToken));

        uint256 bond = registry.creatorBondAmount();
        usdc.mint(creator, bond);
        vm.prank(creator);
        usdc.approve(address(registry), bond);

        ArenaMarket.MarketParams memory params = ArenaMarket.MarketParams({
            marketId: "alt-collateral-market",
            ipfsHash: "ipfs://alt",
            sourcePrimary: bytes32("hf"),
            sourceFallback: bytes32("mirror"),
            tieRule: bytes32("void"),
            voidRule: bytes32("void"),
            openTime: block.timestamp,
            closeTime: block.timestamp + 1 days,
            resolveTime: block.timestamp + 2 days,
            challengeWindowSeconds: 1 days
        });

        vm.prank(creator);
        address proxy = factory.createMarket(params, _defaultOutcomes(), address(0), 0, address(altToken));

        assertTrue(proxy != address(0));
        // The market's collateral should be the alternate token.
        assertEq(address(ArenaMarket(proxy).marketCollateral()), address(altToken));
    }

    function testCreateMarketRevertsForNonWhitelistedCollateral() public {
        MockUSDC altToken = new MockUSDC(); // NOT whitelisted

        uint256 bond = registry.creatorBondAmount();
        usdc.mint(creator, bond);
        vm.prank(creator);
        usdc.approve(address(registry), bond);

        vm.prank(creator);
        vm.expectRevert("Factory: collateral not whitelisted");
        factory.createMarket(_defaultParams(), _defaultOutcomes(), address(0), 0, address(altToken));
    }
}