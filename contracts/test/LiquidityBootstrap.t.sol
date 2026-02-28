// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/LiquidityBootstrap.sol";
import "../src/PrincipalToken.sol";
import "../src/RiskToken.sol";
import "./mocks/MockERC20.sol";

contract LiquidityBootstrapTest is Test {
    LiquidityBootstrap lb;
    MockERC20          usdc;
    PrincipalToken     pt;
    RiskToken          rt;

    address owner = makeAddr("owner");
    address mm    = makeAddr("marketMaker");
    address alice = makeAddr("alice");

    function setUp() public {
        usdc = new MockERC20("USDC", "USDC", 6);

        vm.startPrank(owner);
        pt = new PrincipalToken("XPC", owner);
        rt = new RiskToken("XPC", owner);
        vm.stopPrank();

        vm.prank(owner);
        lb = new LiquidityBootstrap(address(usdc), address(pt), address(rt), owner);

        usdc.mint(owner, 1_000_000e6);
    }

    // ─── constructor ────────────────────────────────────────────────────────

    function test_constructor_revertsZeroAddress() public {
        vm.expectRevert(LiquidityBootstrap.ZeroAddress.selector);
        new LiquidityBootstrap(address(0), address(pt), address(rt), owner);
    }

    function test_constructor_setsImmutables() public view {
        assertEq(address(lb.paymentToken()), address(usdc));
        assertEq(lb.ptToken(), address(pt));
        assertEq(lb.rtToken(), address(rt));
    }

    // ─── setWhitelisted ─────────────────────────────────────────────────────

    function test_setWhitelisted_ownerWhitelists() public {
        vm.prank(owner);
        lb.setWhitelisted(mm, true);
        assertTrue(lb.isWhitelisted(mm));
    }

    function test_setWhitelisted_ownerDewhitelists() public {
        vm.prank(owner);
        lb.setWhitelisted(mm, true);
        vm.prank(owner);
        lb.setWhitelisted(mm, false);
        assertFalse(lb.isWhitelisted(mm));
    }

    function test_setWhitelisted_emitsEvent() public {
        vm.prank(owner);
        vm.expectEmit(true, false, false, true);
        emit LiquidityBootstrap.MMWhitelisted(mm, true);
        lb.setWhitelisted(mm, true);
    }

    function test_setWhitelisted_revertsNonOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        lb.setWhitelisted(mm, true);
    }

    function test_setWhitelisted_revertsZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(LiquidityBootstrap.ZeroAddress.selector);
        lb.setWhitelisted(address(0), true);
    }

    // ─── allocate ───────────────────────────────────────────────────────────

    function test_allocate_ownerAllocates() public {
        uint256 amount = 100_000e6;
        vm.startPrank(owner);
        usdc.approve(address(lb), amount);
        lb.allocate(amount);
        vm.stopPrank();

        assertEq(lb.totalAllocated(), amount);
        assertEq(usdc.balanceOf(address(lb)), amount);
    }

    function test_allocate_accumulates() public {
        vm.startPrank(owner);
        usdc.approve(address(lb), 200_000e6);
        lb.allocate(100_000e6);
        lb.allocate(100_000e6);
        vm.stopPrank();

        assertEq(lb.totalAllocated(), 200_000e6);
    }

    function test_allocate_revertsNonOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        lb.allocate(1e6);
    }

    function test_allocate_revertsZeroAmount() public {
        vm.prank(owner);
        vm.expectRevert(LiquidityBootstrap.ZeroAmount.selector);
        lb.allocate(0);
    }

    // ─── withdrawForLP ──────────────────────────────────────────────────────

    function test_withdrawForLP_mmWithdrawsUSDC() public {
        _allocate(100_000e6);

        vm.prank(owner);
        lb.setWhitelisted(mm, true);

        uint256 pre = usdc.balanceOf(mm);
        vm.prank(mm);
        lb.withdrawForLP(address(usdc), 50_000e6, mm);

        assertEq(usdc.balanceOf(mm) - pre, 50_000e6);
        assertEq(lb.totalWithdrawn(), 50_000e6);
        assertEq(lb.availableForLP(), 50_000e6);
    }

    function test_withdrawForLP_mmWithdrawsPT() public {
        // Give LB some PT first (e.g., from protocol treasury)
        address ptVault = makeAddr("ptVault");
        vm.prank(owner);
        pt.setVault(ptVault);
        vm.prank(ptVault);
        pt.mint(address(lb), 50e18);

        vm.prank(owner);
        lb.setWhitelisted(mm, true);

        vm.prank(mm);
        lb.withdrawForLP(address(pt), 50e18, mm);

        assertEq(pt.balanceOf(mm), 50e18);
        // PT withdrawals don't count against totalWithdrawn
        assertEq(lb.totalWithdrawn(), 0);
    }

    function test_withdrawForLP_revertsNotWhitelisted() public {
        _allocate(100_000e6);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(LiquidityBootstrap.NotWhitelisted.selector, alice));
        lb.withdrawForLP(address(usdc), 1e6, alice);
    }

    function test_withdrawForLP_revertsExceedsAvailable() public {
        _allocate(100_000e6);

        vm.prank(owner);
        lb.setWhitelisted(mm, true);

        vm.prank(mm);
        vm.expectRevert(
            abi.encodeWithSelector(LiquidityBootstrap.ExceedsAvailable.selector, 200_000e6, 100_000e6)
        );
        lb.withdrawForLP(address(usdc), 200_000e6, mm);
    }

    function test_withdrawForLP_revertsZeroAmount() public {
        vm.prank(owner);
        lb.setWhitelisted(mm, true);

        vm.prank(mm);
        vm.expectRevert(LiquidityBootstrap.ZeroAmount.selector);
        lb.withdrawForLP(address(usdc), 0, mm);
    }

    function test_withdrawForLP_revertsZeroAddressTo() public {
        _allocate(100_000e6);

        vm.prank(owner);
        lb.setWhitelisted(mm, true);

        vm.prank(mm);
        vm.expectRevert(LiquidityBootstrap.ZeroAddress.selector);
        lb.withdrawForLP(address(usdc), 1e6, address(0));
    }

    // ─── reportDeployed ─────────────────────────────────────────────────────

    function test_reportDeployed_emitsEvent() public {
        vm.prank(owner);
        lb.setWhitelisted(mm, true);

        vm.prank(mm);
        vm.expectEmit(true, false, false, true);
        emit LiquidityBootstrap.DeploymentReported(mm, 50_000e6, "PT-XPC/USDC 0.3%");
        lb.reportDeployed(50_000e6, "PT-XPC/USDC 0.3%");
    }

    function test_reportDeployed_revertsNotWhitelisted() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(LiquidityBootstrap.NotWhitelisted.selector, alice));
        lb.reportDeployed(1e6, "test");
    }

    // ─── emergencyWithdraw ──────────────────────────────────────────────────

    function test_emergencyWithdraw_ownerWithdrawsAll() public {
        _allocate(100_000e6);

        uint256 pre = usdc.balanceOf(owner);
        vm.prank(owner);
        lb.emergencyWithdraw(owner);

        assertEq(usdc.balanceOf(owner) - pre, 100_000e6);
        assertEq(usdc.balanceOf(address(lb)), 0);
    }

    function test_emergencyWithdraw_revertsNonOwner() public {
        _allocate(100_000e6);
        vm.prank(alice);
        vm.expectRevert();
        lb.emergencyWithdraw(alice);
    }

    function test_emergencyWithdraw_revertsZeroBalance() public {
        vm.prank(owner);
        vm.expectRevert(LiquidityBootstrap.ZeroAmount.selector);
        lb.emergencyWithdraw(owner);
    }

    function test_emergencyWithdraw_revertsZeroAddressTo() public {
        _allocate(100_000e6);
        vm.prank(owner);
        vm.expectRevert(LiquidityBootstrap.ZeroAddress.selector);
        lb.emergencyWithdraw(address(0));
    }

    // ─── availableForLP ─────────────────────────────────────────────────────

    function test_availableForLP_tracksCorrectly() public {
        _allocate(100_000e6);

        vm.prank(owner);
        lb.setWhitelisted(mm, true);

        vm.prank(mm);
        lb.withdrawForLP(address(usdc), 30_000e6, mm);

        assertEq(lb.availableForLP(), 70_000e6);
    }

    // ─── helpers ────────────────────────────────────────────────────────────

    function _allocate(uint256 amount) internal {
        vm.startPrank(owner);
        usdc.approve(address(lb), amount);
        lb.allocate(amount);
        vm.stopPrank();
    }
}
