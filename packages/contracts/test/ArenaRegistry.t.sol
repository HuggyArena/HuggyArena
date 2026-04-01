// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {ArenaRegistry} from "../src/ArenaRegistry.sol";
import {MockUSDC} from "./helpers/MockUSDC.sol";

contract ArenaRegistryTest is Test {
    ArenaRegistry internal registry;
    MockUSDC internal usdc;

    address internal admin = address(0xA11CE);
    address internal operator = address(0xB0B);
    address internal creator = address(0xC0DE);
    address internal treasury2 = address(0xD00D);

    function setUp() public {
        usdc = new MockUSDC();
        vm.prank(admin);
        registry = new ArenaRegistry(address(usdc), admin);
    }

    // ─── Constructor / Immutables ────────────────────────────────────────────

    function testCollateralSet() public view {
        assertEq(address(registry.collateral()), address(usdc));
    }

    function testAdminRoleGranted() public view {
        assertTrue(registry.hasRole(registry.DEFAULT_ADMIN_ROLE(), admin));
    }

    function testOperatorRoleGrantedToAdmin() public view {
        assertTrue(registry.hasRole(registry.OPERATOR_ROLE(), admin));
    }

    function testTreasuryInitialized() public view {
        assertEq(registry.treasury(), admin);
    }

    function testRejectsZeroCollateral() public {
        vm.expectRevert("Registry: zero collateral");
        new ArenaRegistry(address(0), admin);
    }

    // ─── Default fee values ──────────────────────────────────────────────────

    function testDefaultProtocolFee() public view {
        assertEq(registry.protocolFeeBps(), 275);
    }

    function testDefaultCreatorFee() public view {
        assertEq(registry.creatorFeeBps(), 100);
    }

    function testDefaultReferralFee() public view {
        assertEq(registry.referralFeeBps(), 50);
    }

    function testDefaultDisputeReserve() public view {
        assertEq(registry.disputeReserveBps(), 75);
    }

    function testTotalFee() public view {
        assertEq(registry.totalFeeBps(), 500);
    }

    // ─── setFees ─────────────────────────────────────────────────────────────

    function testSetFeesSuccess() public {
        vm.prank(admin);
        registry.setFees(300, 150, 50, 100);
        vm.warp(block.timestamp + registry.treasuryTimelock());
        vm.prank(admin);
        registry.executeFees();
        assertEq(registry.protocolFeeBps(), 300);
        assertEq(registry.creatorFeeBps(), 150);
        assertEq(registry.referralFeeBps(), 50);
        assertEq(registry.disputeReserveBps(), 100);
    }

    function testSetFeesEmitsEvent() public {
        vm.prank(admin);
        vm.expectEmit(false, false, false, true);
        emit ArenaRegistry.FeesProposed(300, 150, 50, 100);
        registry.setFees(300, 150, 50, 100);
    }

    function testSetFeesRevertsWhenExceedsMax() public {
        vm.prank(admin);
        vm.expectRevert("Registry: max fee");
        registry.setFees(2000, 1500, 1000, 1000); // sum = 5500 > 5000
    }

    function testSetFeesRevertsForNonAdmin() public {
        vm.prank(operator);
        vm.expectRevert();
        registry.setFees(100, 100, 50, 50);
    }

    // ─── setTreasury ─────────────────────────────────────────────────────────

    function testSetTreasurySuccess() public {
        vm.prank(admin);
        registry.setTreasury(treasury2);
        vm.warp(block.timestamp + registry.treasuryTimelock());
        vm.prank(admin);
        registry.executeTreasury();
        assertEq(registry.treasury(), treasury2);
    }

    function testSetTreasuryRevertsZeroAddress() public {
        vm.prank(admin);
        vm.expectRevert("Registry: zero treasury");
        registry.setTreasury(address(0));
    }

    function testSetTreasuryRevertsForNonAdmin() public {
        vm.prank(operator);
        vm.expectRevert();
        registry.setTreasury(treasury2);
    }

    // ─── setBeacon ───────────────────────────────────────────────────────────

    function testSetBeaconSuccess() public {
        address newBeacon = address(0xBEAC);
        vm.prank(admin);
        registry.setBeacon(newBeacon);
        assertEq(registry.beacon(), newBeacon);
    }

    function testSetBeaconRevertsZeroAddress() public {
        vm.prank(admin);
        vm.expectRevert("Registry: zero beacon");
        registry.setBeacon(address(0));
    }

    // ─── registerMarket ──────────────────────────────────────────────────────

    function testRegisterMarket() public {
        address market = address(0xDADA);
        vm.prank(admin);
        registry.registerMarket(market, "test-market-1");
        assertTrue(registry.isMarket(market));
        assertEq(registry.marketById("test-market-1"), market);
    }

    function testRegisterMarketRevertsIfAlreadyRegistered() public {
        address market = address(0xDADA);
        vm.startPrank(admin);
        registry.registerMarket(market, "test-market-1");
        vm.expectRevert("Registry: exists");
        registry.registerMarket(market, "test-market-2");
        vm.stopPrank();
    }

    function testRegisterMarketRevertsForNonOperator() public {
        vm.prank(creator);
        vm.expectRevert();
        registry.registerMarket(address(0xDADA), "test-market-1");
    }

    // ─── setCreatorStatus ────────────────────────────────────────────────────

    function testSetCreatorStatus() public {
        vm.prank(admin);
        registry.setCreatorStatus(creator, true);
        assertTrue(registry.isCreator(creator));
    }

    // ─── Sanction checks ─────────────────────────────────────────────────────

    function testSanctionStatus() public {
        vm.prank(admin);
        registry.setSanctionStatus(creator, true);
        assertTrue(registry.checkSanction(creator));

        vm.prank(admin);
        registry.setSanctionStatus(creator, false);
        assertFalse(registry.checkSanction(creator));
    }

    // ─── pause / unpause ─────────────────────────────────────────────────────

    function testPauseAndUnpause() public {
        vm.startPrank(admin);
        registry.pause();
        assertTrue(registry.paused());
        registry.unpause();
        assertFalse(registry.paused());
        vm.stopPrank();
    }

    function testPauseRevertsForNonAdmin() public {
        vm.prank(operator);
        vm.expectRevert();
        registry.pause();
    }

    // ─── Creator bond ─────────────────────────────────────────────────────────

    function testLockCreatorBond() public {
        uint256 bond = registry.creatorBondAmount();
        // Fund creator and approve
        usdc.mint(creator, bond);
        vm.prank(creator);
        usdc.approve(address(registry), bond);

        vm.prank(admin);
        registry.lockCreatorBond(creator, bond);

        assertEq(registry.creatorBondLocked(creator), bond);
    }

    function testSlashCreatorBond() public {
        uint256 bond = registry.creatorBondAmount();
        usdc.mint(creator, bond);
        vm.prank(creator);
        usdc.approve(address(registry), bond);

        vm.startPrank(admin);
        registry.lockCreatorBond(creator, bond);
        registry.slashCreatorBond(creator, bond, "violation");
        vm.stopPrank();

        assertEq(registry.creatorBondLocked(creator), 0);
    }

    function testSlashCreatorBondRevertsIfInsufficientBond() public {
        vm.prank(admin);
        vm.expectRevert("Registry: insufficient");
        registry.slashCreatorBond(creator, 1, "violation");
    }

    function testReleaseCreatorBond() public {
        uint256 bond = registry.creatorBondAmount();
        usdc.mint(creator, bond);
        vm.prank(creator);
        usdc.approve(address(registry), bond);

        vm.startPrank(admin);
        registry.lockCreatorBond(creator, bond);
        registry.releaseCreatorBond(creator, bond);
        vm.stopPrank();

        assertEq(registry.creatorBondLocked(creator), 0);
    }
}
