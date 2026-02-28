// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/AllocationNFT.sol";

contract AllocationNFTTest is Test {
    AllocationNFT nft;

    address owner  = makeAddr("owner");
    address minter = makeAddr("minter");
    address alice  = makeAddr("alice");
    address bob    = makeAddr("bob");

    uint256 constant AMOUNT        = 50e18;
    uint256 constant CLEARING_PRICE = 2e6;
    uint256 constant UNLOCK_TIME   = 1_000_000;

    function setUp() public {
        vm.prank(owner);
        nft = new AllocationNFT(owner);
    }

    // --- setMinter ---

    function test_setMinter_ownerSets() public {
        vm.prank(owner);
        nft.setMinter(minter);
        assertEq(nft.minter(), minter);
    }

    function test_setMinter_emitsEvent() public {
        vm.prank(owner);
        vm.expectEmit(true, true, false, false);
        emit AllocationNFT.MinterUpdated(address(0), minter);
        nft.setMinter(minter);
    }

    function test_setMinter_revertsNonOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        nft.setMinter(minter);
    }

    function test_setMinter_revertsZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(AllocationNFT.ZeroAddress.selector);
        nft.setMinter(address(0));
    }

    // --- mint ---

    function test_mint_minterMintsAndStoresAllocation() public {
        vm.prank(owner);
        nft.setMinter(minter);

        vm.prank(minter);
        uint256 id = nft.mint(alice, AMOUNT, CLEARING_PRICE, UNLOCK_TIME);

        assertEq(id, 0);
        assertEq(nft.ownerOf(0), alice);

        IAllocationNFT.Allocation memory a = nft.getAllocation(0);
        assertEq(a.amount, AMOUNT);
        assertEq(a.clearingPrice, CLEARING_PRICE);
        assertEq(a.unlockTime, UNLOCK_TIME);
    }

    function test_mint_incrementsTokenId() public {
        vm.prank(owner);
        nft.setMinter(minter);

        vm.prank(minter);
        uint256 id0 = nft.mint(alice, AMOUNT, CLEARING_PRICE, UNLOCK_TIME);
        vm.prank(minter);
        uint256 id1 = nft.mint(bob, AMOUNT, CLEARING_PRICE, UNLOCK_TIME);

        assertEq(id0, 0);
        assertEq(id1, 1);
    }

    function test_mint_revertsNonMinter() public {
        vm.prank(owner);
        nft.setMinter(minter);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(AllocationNFT.NotMinter.selector, alice));
        nft.mint(alice, AMOUNT, CLEARING_PRICE, UNLOCK_TIME);
    }

    function test_mint_revertsZeroAddress() public {
        vm.prank(owner);
        nft.setMinter(minter);

        vm.prank(minter);
        vm.expectRevert(AllocationNFT.ZeroAddress.selector);
        nft.mint(address(0), AMOUNT, CLEARING_PRICE, UNLOCK_TIME);
    }

    function test_mint_revertsZeroAmount() public {
        vm.prank(owner);
        nft.setMinter(minter);

        vm.prank(minter);
        vm.expectRevert(AllocationNFT.ZeroAmount.selector);
        nft.mint(alice, 0, CLEARING_PRICE, UNLOCK_TIME);
    }

    // --- getAllocation ---

    function test_getAllocation_revertsInvalidToken() public {
        vm.expectRevert(abi.encodeWithSelector(AllocationNFT.InvalidToken.selector, 999));
        nft.getAllocation(999);
    }

    // --- ownerOf ---

    function test_ownerOf_returnsCorrectOwner() public {
        vm.prank(owner);
        nft.setMinter(minter);

        vm.prank(minter);
        nft.mint(alice, AMOUNT, CLEARING_PRICE, UNLOCK_TIME);

        assertEq(nft.ownerOf(0), alice);
    }

    function test_ownerOf_returnsZeroAfterTransfer() public {
        vm.prank(owner);
        nft.setMinter(minter);

        vm.prank(minter);
        nft.mint(alice, AMOUNT, CLEARING_PRICE, UNLOCK_TIME);

        vm.prank(alice);
        nft.transferFrom(alice, bob, 0);
        assertEq(nft.ownerOf(0), bob);
    }
}
