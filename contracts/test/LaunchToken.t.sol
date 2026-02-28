// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/LaunchToken.sol";

contract LaunchTokenTest is Test {
    LaunchToken token;

    address owner   = makeAddr("owner");
    address minter  = makeAddr("minter");
    address alice   = makeAddr("alice");

    uint256 constant MAX = 1_000_000e18;

    function setUp() public {
        vm.prank(owner);
        token = new LaunchToken("XProtocol", "XPC", MAX, owner);
    }

    // --- constructor ---

    function test_constructor_setsFields() public view {
        assertEq(token.name(), "XProtocol");
        assertEq(token.symbol(), "XPC");
        assertEq(token.maxSupply(), MAX);
        assertEq(token.owner(), owner);
        assertEq(token.minter(), address(0));
    }

    function test_constructor_revertsOnZeroMaxSupply() public {
        vm.expectRevert(LaunchToken.ZeroAmount.selector);
        new LaunchToken("X", "X", 0, owner);
    }

    // --- setMinter ---

    function test_setMinter_ownerCanSet() public {
        vm.prank(owner);
        token.setMinter(minter);
        assertEq(token.minter(), minter);
    }

    function test_setMinter_emitsEvent() public {
        vm.prank(owner);
        vm.expectEmit(true, true, false, false);
        emit LaunchToken.MinterUpdated(address(0), minter);
        token.setMinter(minter);
    }

    function test_setMinter_revertsNonOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        token.setMinter(minter);
    }

    function test_setMinter_revertsZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(LaunchToken.ZeroAddress.selector);
        token.setMinter(address(0));
    }

    // --- mint ---

    function test_mint_minterCanMint() public {
        vm.prank(owner);
        token.setMinter(minter);

        vm.prank(minter);
        token.mint(alice, 100e18);
        assertEq(token.balanceOf(alice), 100e18);
        assertEq(token.totalSupply(), 100e18);
    }

    function test_mint_revertsNonMinter() public {
        vm.prank(owner);
        token.setMinter(minter);

        vm.prank(alice);
        vm.expectRevert();
        token.mint(alice, 1e18);
    }

    function test_mint_revertsZeroAddress() public {
        vm.prank(owner);
        token.setMinter(minter);

        vm.prank(minter);
        vm.expectRevert(LaunchToken.ZeroAddress.selector);
        token.mint(address(0), 1e18);
    }

    function test_mint_revertsZeroAmount() public {
        vm.prank(owner);
        token.setMinter(minter);

        vm.prank(minter);
        vm.expectRevert(LaunchToken.ZeroAmount.selector);
        token.mint(alice, 0);
    }

    function test_mint_revertsExceedsMaxSupply() public {
        vm.prank(owner);
        token.setMinter(minter);

        vm.prank(minter);
        vm.expectRevert();
        token.mint(alice, MAX + 1);
    }

    function test_mint_exactlyAtCap() public {
        vm.prank(owner);
        token.setMinter(minter);

        vm.prank(minter);
        token.mint(alice, MAX);
        assertEq(token.totalSupply(), MAX);

        vm.prank(minter);
        vm.expectRevert();
        token.mint(alice, 1);
    }

    // --- burn ---

    function test_burn_holderCanBurn() public {
        vm.prank(owner);
        token.setMinter(minter);

        vm.prank(minter);
        token.mint(alice, 100e18);

        vm.prank(alice);
        token.burn(40e18);
        assertEq(token.balanceOf(alice), 60e18);
    }

    function test_burn_revertsZeroAmount() public {
        vm.prank(owner);
        token.setMinter(minter);

        vm.prank(minter);
        token.mint(alice, 100e18);

        vm.prank(alice);
        vm.expectRevert(LaunchToken.ZeroAmount.selector);
        token.burn(0);
    }
}
