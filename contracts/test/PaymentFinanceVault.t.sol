// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PaymentFinanceVault as Vault} from "../src/PaymentFinanceVault.sol";
import {MockTIP20} from "./MockTIP20.sol";

contract PaymentFinanceVaultTest is Test {
    MockTIP20 token;
    Vault vault;
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address borrower = makeAddr("borrower");
    address payer = makeAddr("settlement-provider");
    bytes32 diligence = keccak256("simulated-diligence");

    function setUp() public {
        vm.warp(1_800_000_000);
        token = new MockTIP20();
        vault = new Vault(IERC20(address(token)), address(this));
        _deposit(alice, 500e6);
        _deposit(bob, 500e6);
        token.mint(borrower, 1000e6);
        token.mint(payer, 1000e6);
        vm.prank(borrower); token.approve(address(vault), type(uint256).max);
        vm.prank(payer); token.approve(address(vault), type(uint256).max);
        vault.configureBorrower(borrower, true, 750e6, 2 days, diligence);
    }
    function _deposit(address investor, uint256 amount) internal {
        token.mint(investor, amount);
        vm.startPrank(investor);
        token.approve(address(vault), amount);
        vault.deposit(amount, investor);
        vm.stopPrank();
    }
    function _draw(uint128 amount, uint64 tenor) internal returns (uint256 id) {
        bytes32 batchReference = keccak256(abi.encode(vault.nextLoanId()));
        vm.prank(borrower);
        return vault.draw(amount, tenor, batchReference);
    }
    function _pay(uint256 id, uint256 amount) internal {
        vm.prank(borrower); vault.repay(id, amount);
    }

    function testInitialSharesAndDepositBounds() public {
        assertEq(vault.decimals(), 18);
        assertEq(vault.balanceOf(alice), 500 ether);
        assertEq(vault.totalAssets(), 1000e6);
        token.mint(alice, 10e6);
        vm.startPrank(alice);
        token.approve(address(vault), 10e6);
        vm.expectRevert(abi.encodeWithSelector(Vault.MinimumSharesNotMet.selector, 10 ether, 11 ether));
        vault.depositWithMinShares(10e6, alice, 11 ether);
        assertEq(vault.depositWithMinShares(10e6, alice, 10 ether), 10 ether);
        vm.expectRevert(Vault.InvalidAmount.selector); vault.deposit(0, alice);
        vm.stopPrank();
    }
    function testShareTransfersAndDirectEscrowProtection() public {
        uint256 nav = vault.totalAssets();
        vm.prank(alice); vault.transfer(bob, 10 ether);
        assertEq(vault.balanceOf(bob), 510 ether);
        assertEq(vault.totalAssets(), nav);
        vm.prank(alice); vm.expectRevert(Vault.InvalidReceiver.selector); vault.transfer(address(vault), 10 ether);
        vm.startPrank(alice); vault.approve(bob, 10 ether); vm.stopPrank();
        vm.prank(bob); vm.expectRevert(Vault.InvalidReceiver.selector); vault.transferFrom(alice, address(vault), 10 ether);
    }
    function testAllImmediateExitsUnavailable() public {
        assertEq(vault.maxWithdraw(alice), 0);
        assertEq(vault.maxRedeem(alice), 0);
        assertEq(vault.previewRedeem(10 ether), 10e6);
        vm.prank(alice); vm.expectRevert(); vault.redeem(10 ether, alice, alice);
        vm.prank(alice); vm.expectRevert(); vault.withdraw(10e6, alice, alice);
    }
    function testDrawConservesNAVAndMemo() public {
        uint256 nav = vault.totalAssets();
        uint256 id = _draw(600e6, 2 days);
        assertEq(vault.totalAssets(), nav);
        assertEq(token.balanceOf(address(vault)), 400e6);
        assertEq(vault.principalExposure(borrower), 600e6);
        Vault.Loan memory loan = vault.getLoan(id);
        assertEq(loan.dueAt, block.timestamp + 2 days);
        assertEq(vault.loanForBatch(borrower, loan.batchRef), id);
    }
    function testInterestAtSixTwentyFourFortyEightHours() public {
        uint256 id = _draw(100e6, 2 days);
        uint256 start = block.timestamp;
        vm.warp(start + 6 hours);
        (,uint256 interest,) = vault.previewDebt(id);
        assertEq(interest, uint256(100e6) * 1800 * 6 hours / vault.INTEREST_DENOMINATOR());
        vm.warp(start + 24 hours);
        (,interest,) = vault.previewDebt(id);
        assertEq(interest, uint256(100e6) * 1800 * 24 hours / vault.INTEREST_DENOMINATOR());
        vm.warp(start + 48 hours);
        (,interest,) = vault.previewDebt(id);
        assertEq(interest, uint256(100e6) * 1800 * 48 hours / vault.INTEREST_DENOMINATOR());
    }
    function testInterestFirstAndPrincipalCheckpoint() public {
        uint256 id = _draw(600e6, 2 days);
        vm.warp(block.timestamp + 1 days);
        (,uint256 interest,) = vault.previewDebt(id);
        uint256 nav = vault.totalAssets();
        _pay(id, interest);
        assertEq(vault.principalExposure(borrower), 600e6);
        assertEq(vault.availableCredit(borrower), 150e6);
        assertEq(vault.totalAssets(), nav);
        _pay(id, 100e6);
        Vault.Loan memory loan = vault.getLoan(id);
        assertEq(loan.principalOutstanding, 500e6);
        uint256 previousRemainder = loan.accrualRemainder;
        vm.warp(block.timestamp + 1 hours);
        (,interest,) = vault.previewDebt(id);
        assertEq(interest, (uint256(500e6) * 1800 * 1 hours + previousRemainder) / vault.INTEREST_DENOMINATOR());
    }
    function testRemainderSurvivesRepeatedCheckpoints() public {
        uint256 id = _draw(600e6, 2 days);
        uint256 expectedRemainder;
        uint256 principal = 600e6;
        for (uint256 i; i < 20; ++i) {
            vm.warp(block.timestamp + 1);
            uint256 numerator = principal * 1800 + expectedRemainder;
            uint256 interest = numerator / vault.INTEREST_DENOMINATOR();
            expectedRemainder = numerator % vault.INTEREST_DENOMINATOR();
            _pay(id, interest + 1);
            --principal;
            Vault.Loan memory loan = vault.getLoan(id);
            assertEq(loan.accrualRemainder, expectedRemainder);
            assertEq(loan.principalOutstanding, principal);
            assertEq(loan.interestAccrued, 0);
        }
    }
    function testSettlementRepaymentRestoresCreditWithoutDoubleIncome() public {
        uint256 id = _draw(600e6, 2 days);
        vm.warp(block.timestamp + 1 days);
        uint256 nav = vault.totalAssets();
        Vault.Loan memory loan = vault.getLoan(id);
        vm.prank(payer); uint256 paid = vault.repaySettlement(borrower, loan.batchRef, 601e6);
        assertGt(paid, 600e6);
        assertEq(vault.totalAssets(), nav);
        assertEq(vault.availableCredit(borrower), 750e6);
        assertEq(uint256(vault.getLoan(id).status), uint256(Vault.LoanStatus.Settled));
        assertEq(vault.getActiveLoanIds().length, 0);
        vm.prank(payer); vm.expectRevert(Vault.LoanAlreadySettled.selector); vault.repaySettlement(borrower, loan.batchRef, 601e6);
        vm.prank(borrower); vm.expectRevert(abi.encodeWithSelector(Vault.DrawUnavailable.selector, Vault.DrawBlockReason.InvalidRequest));
        vault.draw(1e6, 60, loan.batchRef);
        _draw(600e6, 60);
    }
    function testRepaymentBoundsZeroAndOverpayment() public {
        uint256 id = _draw(600e6, 2 days);
        vm.prank(borrower); vm.expectRevert(Vault.InvalidAmount.selector); vault.repay(id, 0);
        vm.prank(borrower); vm.expectRevert(abi.encodeWithSelector(Vault.RepaymentExceedsDebt.selector, 600e6)); vault.repay(id, 601e6);
        vm.prank(borrower); vm.expectRevert(abi.encodeWithSelector(Vault.RepaymentBoundExceeded.selector, 600e6, 599e6)); vault.repayAll(id, 599e6);
        vm.prank(payer); vm.expectRevert(Vault.LoanNotFound.selector); vault.repaySettlement(borrower, keccak256("absent"), 1000e6);
    }
    function testCreditReserveAndApprovalRestrictions() public {
        vm.prank(alice); vm.expectRevert(abi.encodeWithSelector(Vault.DrawUnavailable.selector, Vault.DrawBlockReason.NotApproved)); vault.draw(1e6, 60, diligence);
        vm.prank(borrower); vm.expectRevert(abi.encodeWithSelector(Vault.DrawUnavailable.selector, Vault.DrawBlockReason.CreditLimit)); vault.draw(751e6, 60, diligence);
        vault.configureBorrower(borrower, true, 1000e6, 2 days, diligence);
        vm.prank(borrower); vm.expectRevert(abi.encodeWithSelector(Vault.DrawUnavailable.selector, Vault.DrawBlockReason.LiquidityReserve)); vault.draw(901e6, 60, diligence);
        _draw(900e6, 60);
        assertEq(token.balanceOf(address(vault)), 100e6);
        (,Vault.DrawBlockReason reason) = vault.availableToDraw(borrower);
        assertEq(uint256(reason), uint256(Vault.DrawBlockReason.LiquidityReserve));
    }
    function testBorrowerAndGlobalLoanBounds() public {
        for (uint256 i; i < 8; ++i) _draw(1e6, 60);
        vm.prank(borrower); vm.expectRevert(abi.encodeWithSelector(Vault.DrawUnavailable.selector, Vault.DrawBlockReason.ActiveLoanLimit)); vault.draw(1e6, 60, diligence);
        for (uint256 b; b < 3; ++b) {
            address other = address(uint160(1000 + b));
            vault.configureBorrower(other, true, 750e6, 2 days, diligence);
            for (uint256 i; i < 8; ++i) { vm.prank(other); vault.draw(1e6, 60, keccak256(abi.encode(b,i))); }
        }
        assertEq(vault.getActiveLoanIds().length, 32);
        address fifth = makeAddr("fifth");
        vault.configureBorrower(fifth, true, 750e6, 2 days, diligence);
        vm.prank(fifth); vm.expectRevert(abi.encodeWithSelector(Vault.DrawUnavailable.selector, Vault.DrawBlockReason.ActiveLoanLimit)); vault.draw(1e6, 60, diligence);
    }
    function testOverdueBoundaryAndReasonPrecedence() public {
        uint256 id = _draw(600e6, 60);
        uint256 due = vault.getLoan(id).dueAt;
        vm.warp(due); assertFalse(vault.hasOverdueLoans());
        vm.warp(due + 1); assertTrue(vault.hasOverdueLoans());
        vm.prank(alice); vault.requestRedeem(500 ether);
        (,Vault.DrawBlockReason reason) = vault.availableToDraw(borrower);
        assertEq(uint256(reason), uint256(Vault.DrawBlockReason.BorrowerOverdue));
        vm.expectRevert(Vault.OverdueLoansBlockProcessing.selector); vault.processRedemptions(10);
        vault.setPauses(false, true);
        (,reason) = vault.availableToDraw(borrower);
        assertEq(uint256(reason), uint256(Vault.DrawBlockReason.BorrowingPaused));
        vm.prank(payer); vault.repayAll(id, 601e6);
        assertFalse(vault.hasOverdueLoans());
        assertEq(vault.processRedemptions(10), 1);
    }
    function testQueueLiquidityFIFOAndCancellation() public {
        uint256 id = _draw(600e6, 2 days);
        vm.prank(alice); uint256 first = vault.requestRedeem(500 ether);
        vm.prank(bob); uint256 second = vault.requestRedeem(10 ether);
        assertEq(vault.balanceOf(address(vault)), 510 ether);
        assertEq(vault.totalSupply(), 1000 ether);
        assertEq(vault.processRedemptions(10), 0);
        assertEq(vault.queueHead(), first);
        (,Vault.DrawBlockReason reason) = vault.availableToDraw(borrower);
        assertEq(uint256(reason), uint256(Vault.DrawBlockReason.RedemptionsPending));
        vm.prank(alice); vm.expectRevert(Vault.ExistingRedemption.selector); vault.requestRedeem(10 ether);
        vm.prank(bob); vm.expectRevert(Vault.NotRequestOwner.selector); vault.cancelRedeem(first);
        vm.prank(bob); vault.cancelRedeem(second);
        assertEq(vault.balanceOf(bob), 500 ether);
        _pay(id, 600e6);
        assertEq(vault.processRedemptions(10), 1);
        assertEq(token.balanceOf(alice), 500e6);
        assertEq(vault.pendingRequests(), 0);
        assertEq(vault.balanceOf(address(vault)), 0);
        assertEq(vault.processRedemptions(10), 0);
    }
    function testQueueMinimumAndCancelledEntriesBound() public {
        vm.prank(alice); vm.expectRevert(Vault.RedemptionTooSmall.selector); vault.requestRedeem(9 ether);
        for (uint256 i; i < 12; ++i) {
            address investor = address(uint160(2000 + i));
            _deposit(investor, 10e6);
            vm.startPrank(investor); uint256 requestId = vault.requestRedeem(10 ether); vault.cancelRedeem(requestId); vm.stopPrank();
        }
        assertEq(vault.processRedemptions(10), 0);
        assertEq(vault.queueHead(), 11);
        vm.expectRevert(Vault.InvalidProcessingLimit.selector); vault.processRedemptions(11);
        vm.expectRevert(Vault.InvalidProcessingLimit.selector); vault.processRedemptions(0);
    }
    function testWriteOffAndRecoveryAccounting() public {
        uint256 id = _draw(600e6, 60);
        vm.expectRevert(Vault.LoanNotOverdue.selector); vault.writeOff(id, diligence);
        vm.warp(block.timestamp + 61);
        uint256 nav = vault.totalAssets();
        (,,uint256 debt) = vault.previewDebt(id);
        vm.prank(bob); vm.expectRevert(); vault.writeOff(id, diligence);
        vault.writeOff(id, diligence);
        assertEq(vault.totalAssets(), nav - debt);
        assertEq(vault.cumulativeWrittenOff(), debt);
        assertEq(vault.principalExposure(borrower), 600e6);
        assertEq(vault.unresolvedWrittenOffLoans(borrower), 1);
        vm.expectRevert(Vault.LoanNotOverdue.selector); vault.writeOff(id, diligence);
        vm.warp(block.timestamp + 365 days);
        (,,uint256 frozenDebt) = vault.previewDebt(id); assertEq(frozenDebt, debt);
        vault.configureBorrower(borrower, true, 750e6, 2 days, diligence);
        (,Vault.DrawBlockReason reason) = vault.availableToDraw(borrower);
        assertEq(uint256(reason), uint256(Vault.DrawBlockReason.UnresolvedDefault));
        uint256 writtenOffNAV = vault.totalAssets();
        vm.prank(payer); vault.repay(id, 100e6);
        assertEq(vault.totalAssets(), writtenOffNAV + 100e6);
        assertEq(vault.cumulativeRecovered(), 100e6);
        vm.prank(payer); vault.repayAll(id, 601e6);
        assertEq(vault.principalExposure(borrower), 0);
        assertEq(vault.unresolvedWrittenOffLoans(borrower), 0);
        assertFalse(vault.getBorrower(borrower).config.enabled);
    }
    function testQueuedSharesAbsorbLossAtProcessingAndRecoveryBenefitsRemainingHolders() public {
        uint256 id = _draw(600e6, 60);
        vm.prank(alice); vault.requestRedeem(500 ether);
        vm.warp(block.timestamp + 61);
        vault.writeOff(id, diligence);
        assertFalse(vault.hasOverdueLoans());
        assertEq(vault.processRedemptions(10), 1);
        assertApproxEqAbs(token.balanceOf(alice), 200e6, 1);
        uint256 bobValue = vault.previewRedeem(vault.balanceOf(bob));
        vm.prank(payer); vault.repayAll(id, 601e6);
        assertGt(vault.previewRedeem(vault.balanceOf(bob)), bobValue);
        assertApproxEqAbs(token.balanceOf(alice), 200e6, 1);
    }
    function testZeroNAVDisablesDepositAndRecoveryRestoresIt() public {
        uint256 id = _draw(600e6, 60);
        vm.warp(block.timestamp + 61); vault.writeOff(id, diligence);
        // Removing cash models a total-loss state without adding a production rescue function.
        uint256 cash = token.balanceOf(address(vault));
        vm.prank(address(vault)); token.transfer(payer, cash);
        assertEq(vault.totalAssets(), 0);
        assertEq(vault.maxDeposit(alice), 0);
        vm.prank(alice); vm.expectRevert(); vault.deposit(1e6, alice);
        vm.prank(payer); vault.repay(id, 100e6);
        assertGt(vault.maxDeposit(alice), 0);
    }
    function testPausesKeepRepaymentAndQueueAvailable() public {
        uint256 id = _draw(600e6, 2 days);
        vault.setPauses(true, true);
        assertEq(vault.maxDeposit(alice), 0);
        vm.prank(alice); vm.expectRevert(); vault.deposit(1e6, alice);
        vm.prank(borrower); vm.expectRevert(abi.encodeWithSelector(Vault.DrawUnavailable.selector, Vault.DrawBlockReason.BorrowingPaused)); vault.draw(1e6, 60, diligence);
        vm.startPrank(alice); uint256 req = vault.requestRedeem(500 ether); vault.cancelRedeem(req); vault.requestRedeem(500 ether); vm.stopPrank();
        _pay(id, 600e6);
        assertEq(vault.processRedemptions(10), 1);
    }
    function testBlockedTokenTransfersRollbackAllMutations() public {
        token.setFailTransfers(true);
        vm.prank(borrower); vm.expectRevert(); vault.draw(600e6, 60, diligence);
        assertEq(vault.nextLoanId(), 1);
        assertEq(vault.principalExposure(borrower), 0);
        token.setFailTransfers(false);
        uint256 id = _draw(600e6, 60);
        token.setFailTransfers(true);
        vm.prank(borrower); vm.expectRevert(); vault.repayAll(id, 601e6);
        assertEq(vault.principalExposure(borrower), 600e6);
        token.setFailTransfers(false); _pay(id, 600e6);
        vm.prank(alice); uint256 req = vault.requestRedeem(500 ether);
        token.setFailTransfers(true);
        vm.expectRevert(); vault.processRedemptions(10);
        assertEq(uint256(vault.getRedemption(req).status), uint256(Vault.RedemptionStatus.Pending));
        assertEq(vault.balanceOf(address(vault)), 500 ether);
    }
    function testLateDepositsDoNotCaptureAlreadyAccruedInterest() public {
        _draw(600e6, 2 days); vm.warp(block.timestamp + 1 days);
        uint256 quote = vault.previewDeposit(100e6);
        assertLt(quote, 100 ether);
        _deposit(payer, 100e6);
        assertEq(vault.balanceOf(payer), quote);
        assertApproxEqAbs(vault.previewRedeem(quote), 100e6, 1);
    }
    function testDonationAndSlippageProtection() public {
        uint256 quote = vault.previewDeposit(10e6);
        token.mint(address(vault), 10e6);
        token.mint(alice, 10e6);
        vm.startPrank(alice); token.approve(address(vault), 10e6);
        vm.expectPartialRevert(Vault.MinimumSharesNotMet.selector); vault.depositWithMinShares(10e6, alice, quote);
        vm.stopPrank();
        assertEq(vault.totalAssets(), 1010e6);
    }
    function testFuzzPartialRepaymentConservesNAV(uint32 secondsElapsed, uint64 payment) public {
        uint256 id = _draw(600e6, 2 days);
        vm.warp(block.timestamp + bound(secondsElapsed, 0, 2 days));
        (,,uint256 debt) = vault.previewDebt(id);
        uint256 nav = vault.totalAssets();
        _pay(id, bound(payment, 1, debt));
        assertEq(vault.totalAssets(), nav);
    }
}
