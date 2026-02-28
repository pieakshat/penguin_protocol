// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/PrincipalToken.sol";
import "../src/RiskToken.sol";

contract PrincipalTokenTest is Test {
    PrincipalToken pt;

    address owner = makeAddr("owner");
    address vault = makeAddr("vault");
    address alice = makeAddr("alice");

    function setUp() public {
        vm.prank(owner);
        pt = new PrincipalToken("XPC", owner);
    }

    // --- metadata ---

    function test_metadata() public view {
        assertEq(pt.name(), "Principal Token - XPC");
        assertEq(pt.symbol(), "PT-XPC");
    }

    // --- setVault ---

    function test_setVault_ownerSets() public {
        vm.prank(owner);
        pt.setVault(vault);
        assertEq(pt.vault(), vault);
    }

    function test_setVault_emitsEvent() public {
        vm.prank(owner);
        vm.expectEmit(true, true, false, false);
        emit PrincipalToken.VaultUpdated(address(0), vault);
        pt.setVault(vault);
    }

    function test_setVault_revertsNonOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        pt.setVault(vault);
    }

    function test_setVault_revertsZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(PrincipalToken.ZeroAddress.selector);
        pt.setVault(address(0));
    }

    // --- mint ---

    function test_mint_vaultCanMint() public {
        vm.prank(owner);
        pt.setVault(vault);

        vm.prank(vault);
        pt.mint(alice, 100e18);
        assertEq(pt.balanceOf(alice), 100e18);
    }

    function test_mint_revertsNonVault() public {
        vm.prank(owner);
        pt.setVault(vault);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(PrincipalToken.NotVault.selector, alice));
        pt.mint(alice, 100e18);
    }

    function test_mint_revertsZeroAddress() public {
        vm.prank(owner);
        pt.setVault(vault);

        vm.prank(vault);
        vm.expectRevert(PrincipalToken.ZeroAddress.selector);
        pt.mint(address(0), 100e18);
    }

    function test_mint_revertsZeroAmount() public {
        vm.prank(owner);
        pt.setVault(vault);

        vm.prank(vault);
        vm.expectRevert(PrincipalToken.ZeroAmount.selector);
        pt.mint(alice, 0);
    }

    // --- burnFrom ---

    function test_burnFrom_withApproval() public {
        vm.prank(owner);
        pt.setVault(vault);

        vm.prank(vault);
        pt.mint(alice, 100e18);

        address settlement = makeAddr("settlement");

        vm.prank(alice);
        pt.approve(settlement, 50e18);

        vm.prank(settlement);
        pt.burnFrom(alice, 50e18);

        assertEq(pt.balanceOf(alice), 50e18);
    }

    function test_burnFrom_revertsWithoutApproval() public {
        vm.prank(owner);
        pt.setVault(vault);

        vm.prank(vault);
        pt.mint(alice, 100e18);

        address settlement = makeAddr("settlement");

        vm.prank(settlement);
        vm.expectRevert();
        pt.burnFrom(alice, 50e18);
    }
}

contract RiskTokenTest is Test {
    RiskToken rt;

    address owner = makeAddr("owner");
    address vault = makeAddr("vault");
    address alice = makeAddr("alice");

    function setUp() public {
        vm.prank(owner);
        rt = new RiskToken("XPC", owner);
    }

    function test_metadata() public view {
        assertEq(rt.name(), "Risk Token - XPC");
        assertEq(rt.symbol(), "RT-XPC");
    }

    function test_setVault_ownerSets() public {
        vm.prank(owner);
        rt.setVault(vault);
        assertEq(rt.vault(), vault);
    }

    function test_mint_vaultCanMint() public {
        vm.prank(owner);
        rt.setVault(vault);

        vm.prank(vault);
        rt.mint(alice, 200e18);
        assertEq(rt.balanceOf(alice), 200e18);
    }

    function test_burnFrom_withApproval() public {
        vm.prank(owner);
        rt.setVault(vault);

        vm.prank(vault);
        rt.mint(alice, 100e18);

        address settlement = makeAddr("settlement");

        vm.prank(alice);
        rt.approve(settlement, 100e18);

        vm.prank(settlement);
        rt.burnFrom(alice, 100e18);

        assertEq(rt.balanceOf(alice), 0);
    }
}
