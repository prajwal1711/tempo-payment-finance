// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PaymentFinanceVault as Vault} from "../src/PaymentFinanceVault.sol";
import {MockTIP20} from "./MockTIP20.sol";

contract VaultHandler is Test {
    Vault public vault;
    MockTIP20 public token;
    address public borrower = address(0xb0);
    address[2] public investors = [address(0xa1), address(0xa2)];
    uint256 public queueChecks;
    constructor(Vault v, MockTIP20 t) { vault = v; token = t; }
    function deposit(uint256 amount, uint256 actor) external {
        address investor = investors[actor % 2];
        if (vault.maxDeposit(investor) == 0) return;
        amount = bound(amount, 1e6, 100e6);
        token.mint(investor, amount);
        vm.startPrank(investor); token.approve(address(vault), amount); vault.deposit(amount, investor); vm.stopPrank();
    }
    function draw(uint256 amount) external {
        (uint256 available,) = vault.availableToDraw(borrower);
        if (available == 0) return;
        amount = bound(amount, 1, available);
        bytes32 batch = keccak256(abi.encode(vault.nextLoanId()));
        vm.prank(borrower); vault.draw(uint128(amount), 2 days, batch);
    }
    function elapse(uint256 secondsElapsed) external { vm.warp(block.timestamp + bound(secondsElapsed, 1, 8 hours)); }
    function repay(uint256 idSeed, uint256 amountSeed) external {
        if (vault.nextLoanId() == 1) return;
        uint256 id = bound(idSeed, 1, vault.nextLoanId() - 1);
        (,,uint256 debt) = vault.previewDebt(id);
        if (debt == 0) return;
        uint256 amount = bound(amountSeed, 1, debt);
        token.mint(borrower, amount);
        vm.startPrank(borrower); token.approve(address(vault), amount); vault.repay(id, amount); vm.stopPrank();
    }
    function writeOff(uint256 idSeed) external {
        if (vault.nextLoanId() == 1) return;
        uint256 id = bound(idSeed, 1, vault.nextLoanId() - 1);
        Vault.Loan memory loan = vault.getLoan(id);
        if (loan.status != Vault.LoanStatus.Active || block.timestamp <= loan.dueAt) return;
        address owner = vault.owner();
        vm.prank(owner); vault.writeOff(id, keccak256("fixture-default"));
    }
    function request(uint256 actor, uint256 amountSeed) external {
        address investor = investors[actor % 2];
        uint256 balance = vault.balanceOf(investor);
        if (balance < 10 ether || vault.pendingRequestOf(investor) != 0) return;
        uint256 amount = bound(amountSeed, 10 ether, balance);
        vm.prank(investor); vault.requestRedeem(amount);
    }
    function cancel(uint256 actor) external {
        address investor = investors[actor % 2];
        uint256 id = vault.pendingRequestOf(investor);
        if (id == 0) return;
        vm.prank(investor); vault.cancelRedeem(id);
    }
    function process(uint256 limitSeed) external {
        if (vault.hasOverdueLoans()) return;
        uint256 limit = bound(limitSeed, 1, 10);
        uint256 beforeHead = vault.queueHead();
        vault.processRedemptions(limit);
        assertLe(vault.queueHead() - beforeHead, limit);
        ++queueChecks;
    }
}

contract VaultInvariantsTest is StdInvariant, Test {
    Vault vault;
    MockTIP20 token;
    VaultHandler handler;
    function setUp() public {
        vm.warp(1_800_000_000);
        token = new MockTIP20();
        vault = new Vault(IERC20(address(token)), address(this));
        handler = new VaultHandler(vault, token);
        vault.configureBorrower(handler.borrower(), true, 750e6, 2 days, keccak256("fixture"));
        handler.deposit(100e6, 0);
        handler.deposit(100e6, 1);
        targetContract(address(handler));
        bytes4[] memory selectors = new bytes4[](8);
        selectors[0] = VaultHandler.deposit.selector;
        selectors[1] = VaultHandler.draw.selector;
        selectors[2] = VaultHandler.elapse.selector;
        selectors[3] = VaultHandler.repay.selector;
        selectors[4] = VaultHandler.writeOff.selector;
        selectors[5] = VaultHandler.request.selector;
        selectors[6] = VaultHandler.cancel.selector;
        selectors[7] = VaultHandler.process.selector;
        targetSelector(FuzzSelector(address(handler), selectors));
    }
    function invariantPrincipalExposureMatchesAllContractualDebt() public view {
        uint256 principal;
        uint256 activeCount;
        for (uint256 id = 1; id < vault.nextLoanId(); ++id) {
            Vault.Loan memory loan = vault.getLoan(id);
            principal += loan.principalOutstanding;
            if (loan.status == Vault.LoanStatus.Active) ++activeCount;
            if (loan.status == Vault.LoanStatus.Settled) assertEq(loan.principalOutstanding + loan.interestAccrued, 0);
        }
        assertEq(principal, vault.principalExposure(handler.borrower()));
        assertEq(activeCount, vault.getActiveLoanIds().length);
        assertLe(activeCount, 8);
    }
    function invariantNAVEqualsCashAndActiveReceivables() public view {
        uint256 expected = token.balanceOf(address(vault));
        uint256[] memory ids = vault.getActiveLoanIds();
        for (uint256 i; i < ids.length; ++i) {
            assertEq(uint256(vault.getLoan(ids[i]).status), uint256(Vault.LoanStatus.Active));
            (,,uint256 debt) = vault.previewDebt(ids[i]);
            expected += debt;
        }
        assertEq(vault.totalAssets(), expected);
        assertEq(vault.getPoolSnapshot().nav, expected);
    }
    function invariantPendingRequestsExactlyMatchEscrow() public view {
        uint256 shares;
        uint256 count;
        for (uint256 id = 1; id < vault.nextRedemptionId(); ++id) {
            Vault.RedemptionRequest memory request = vault.getRedemption(id);
            if (request.status == Vault.RedemptionStatus.Pending) {
                shares += request.shares;
                ++count;
                assertEq(vault.pendingRequestOf(request.owner), id);
            }
        }
        assertEq(shares, vault.balanceOf(address(vault)));
        assertEq(count, vault.pendingRequests());
    }
}
