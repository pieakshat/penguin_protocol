// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/ARMVault.sol";
import "../src/AllocationNFT.sol";
import "../src/PrincipalToken.sol";
import "../src/RiskToken.sol";
import "./mocks/MockBatchAuction.sol";

contract ARMVaultTest is Test {
    ARMVault          vault;
    AllocationNFT     nft;
    PrincipalToken    pt;
    RiskToken         rt;
    MockBatchAuction  mockAuction;

    address owner = makeAddr("owner");
    address alice = makeAddr("alice");
    address bob   = makeAddr("bob");

    uint256 constant CP     = 2e6;    // clearing price $2 USDC
    uint256 constant UNLOCK = 9_999_999;
    uint256 constant AMT    = 100e18;

    function setUp() public {
        mockAuction = new MockBatchAuction();
        mockAuction.setClearingPrice(CP);
        mockAuction.setUnlockTime(UNLOCK);
        // Not finalized yet

        vm.startPrank(owner);
        nft = new AllocationNFT(owner);
        pt  = new PrincipalToken("XPC", owner);
        rt  = new RiskToken("XPC", owner);
        vm.stopPrank();

        vault = new ARMVault(
            address(mockAuction),
            address(nft),
            address(pt),
            address(rt)
        );

        vm.startPrank(owner);
        nft.setMinter(owner); // owner mints NFTs directly in tests
        pt.setVault(address(vault));
        rt.setVault(address(vault));
        vm.stopPrank();
    }

    // ─── constructor ────────────────────────────────────────────────────────

    function test_constructor_revertsZeroAddress() public {
        vm.expectRevert(ARMVault.ZeroAddress.selector);
        new ARMVault(address(0), address(nft), address(pt), address(rt));
    }

    // ─── clearingPrice / unlockTime ─────────────────────────────────────────

    function test_clearingPrice_readsFromAuctionBeforeDeposit() public view {
        assertEq(vault.clearingPrice(), CP);
    }

    function test_unlockTime_readsFromAuction() public view {
        assertEq(vault.unlockTime(), UNLOCK);
    }

    // ─── deposit ────────────────────────────────────────────────────────────

    function test_deposit_revertsAuctionNotFinalized() public {
        uint256 nftId = _mintNFT(alice, AMT, CP);

        vm.startPrank(alice);
        nft.approve(address(vault), nftId);
        vm.expectRevert(ARMVault.AuctionNotFinalized.selector);
        vault.deposit(nftId);
        vm.stopPrank();
    }

    function test_deposit_mintsEqualPTandRT() public {
        mockAuction.setFinalized(true);
        uint256 nftId = _mintNFT(alice, AMT, CP);

        vm.startPrank(alice);
        nft.approve(address(vault), nftId);
        vault.deposit(nftId);
        vm.stopPrank();

        assertEq(pt.balanceOf(alice), AMT);
        assertEq(rt.balanceOf(alice), AMT);
    }

    function test_deposit_transfersNFTToVault() public {
        mockAuction.setFinalized(true);
        uint256 nftId = _mintNFT(alice, AMT, CP);

        vm.startPrank(alice);
        nft.approve(address(vault), nftId);
        vault.deposit(nftId);
        vm.stopPrank();

        assertEq(nft.ownerOf(nftId), address(vault));
    }

    function test_deposit_recordsDepositor() public {
        mockAuction.setFinalized(true);
        uint256 nftId = _mintNFT(alice, AMT, CP);

        vm.startPrank(alice);
        nft.approve(address(vault), nftId);
        vault.deposit(nftId);
        vm.stopPrank();

        assertEq(vault.getDepositor(nftId), alice);
    }

    function test_deposit_cachesClearingPrice() public {
        mockAuction.setFinalized(true);
        uint256 nftId = _mintNFT(alice, AMT, CP);

        vm.startPrank(alice);
        nft.approve(address(vault), nftId);
        vault.deposit(nftId);
        vm.stopPrank();

        // Update mock price — cached value should be returned
        mockAuction.setClearingPrice(999e6);
        assertEq(vault.clearingPrice(), CP);
    }

    function test_deposit_revertsAlreadyDeposited() public {
        mockAuction.setFinalized(true);
        uint256 nftId = _mintNFT(alice, AMT, CP);

        vm.startPrank(alice);
        nft.approve(address(vault), nftId);
        vault.deposit(nftId);

        // Re-approving won't work after transfer, but we test the guard
        vm.stopPrank();

        // Transfer NFT back via owner (not realistic but tests the guard)
        vm.prank(address(vault));
        nft.transferFrom(address(vault), alice, nftId);

        vm.startPrank(alice);
        nft.approve(address(vault), nftId);
        vm.expectRevert(abi.encodeWithSelector(ARMVault.AlreadyDeposited.selector, nftId));
        vault.deposit(nftId);
        vm.stopPrank();
    }

    function test_deposit_revertsNotNFTOwner() public {
        mockAuction.setFinalized(true);
        uint256 nftId = _mintNFT(alice, AMT, CP);

        // Alice approves, but Bob tries to deposit
        vm.prank(alice);
        nft.approve(address(vault), nftId);

        vm.prank(bob);
        vm.expectRevert(
            abi.encodeWithSelector(ARMVault.NotNFTOwner.selector, nftId, bob)
        );
        vault.deposit(nftId);
    }

    function test_deposit_revertsClearingPriceMismatch() public {
        mockAuction.setFinalized(true);
        uint256 wrongCP = 3e6;
        uint256 nftId = _mintNFT(alice, AMT, wrongCP); // NFT has price $3, vault cached $2

        // Force cache to be set by doing a valid deposit first
        uint256 firstNftId = _mintNFT(bob, AMT, CP);
        vm.startPrank(bob);
        nft.approve(address(vault), firstNftId);
        vault.deposit(firstNftId);
        vm.stopPrank();

        vm.startPrank(alice);
        nft.approve(address(vault), nftId);
        vm.expectRevert(
            abi.encodeWithSelector(ARMVault.ClearingPriceMismatch.selector, CP, wrongCP)
        );
        vault.deposit(nftId);
        vm.stopPrank();
    }

    function test_deposit_emitsEvent() public {
        mockAuction.setFinalized(true);
        uint256 nftId = _mintNFT(alice, AMT, CP);

        vm.startPrank(alice);
        nft.approve(address(vault), nftId);
        vm.expectEmit(true, true, false, true);
        emit ARMVault.Deposited(nftId, alice, AMT, CP);
        vault.deposit(nftId);
        vm.stopPrank();
    }

    // ─── helpers ────────────────────────────────────────────────────────────

    function _mintNFT(address to, uint256 amount, uint256 cp) internal returns (uint256) {
        vm.prank(owner);
        return nft.mint(to, amount, cp, UNLOCK);
    }
}
