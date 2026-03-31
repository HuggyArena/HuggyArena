// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {ArenaRegistry} from "../src/ArenaRegistry.sol";
import {ArenaFactory} from "../src/ArenaFactory.sol";
import {ArenaMarket} from "../src/ArenaMarket.sol";

contract Deploy is Script {
    function run() external {
        uint256 deployerPk = vm.envUint("PRIVATE_KEY");
        address admin = vm.envAddress("ADMIN_ADDRESS");
        address usdc = vm.envAddress("USDC_ADDRESS");

        vm.startBroadcast(deployerPk);

        ArenaRegistry registry = new ArenaRegistry(usdc, admin);
        ArenaMarket implementation = new ArenaMarket();
        ArenaFactory factory = new ArenaFactory(address(registry), address(implementation));

        registry.setBeacon(address(factory.beacon()));
        registry.grantRole(registry.OPERATOR_ROLE(), address(factory));
        registry.grantRole(registry.OPERATOR_ROLE(), admin);

        vm.stopBroadcast();

        console2.log("Registry:", address(registry));
        console2.log("Factory:", address(factory));
        console2.log("Beacon:", address(factory.beacon()));
        console2.log("Implementation:", address(implementation));
    }
}
