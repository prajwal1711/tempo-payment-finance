// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ITIP20} from "./ITIP20.sol";

/// @notice Testnet unsecured payment-finance pool. Active receivables are carried
/// at face value until a manager recognizes a full write-off. Queued exits are
/// custom and do not implement ERC-7540.
contract PaymentFinanceVault is ERC4626, Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant APR_BPS = 1800;
    uint256 public constant YEAR_SECONDS = 365 days;
    uint256 public constant INTEREST_DENOMINATOR = 10_000 * YEAR_SECONDS;
    uint256 public constant MIN_REDEMPTION_SHARES = 10 ether;
    uint256 public constant MAX_ACTIVE_LOANS = 32;
    uint256 public constant MAX_BORROWER_LOANS = 8;
    uint256 public constant MAX_QUEUE_ENTRIES = 10;
    uint64 public constant MIN_TENOR_SECONDS = 60;

    enum LoanStatus { None, Active, WrittenOff, Settled }
    enum RedemptionStatus { None, Pending, Processed, Cancelled }
    enum DrawBlockReason {
        Available, NotApproved, UnresolvedDefault, BorrowingPaused,
        BorrowerOverdue, RedemptionsPending, InvalidRequest, ActiveLoanLimit,
        CreditLimit, LiquidityReserve
    }
    struct BorrowerConfig {
        bool enabled;
        uint128 creditLimit;
        uint64 maxTenorSeconds;
        bytes32 diligenceHash;
    }
    struct BorrowerView {
        BorrowerConfig config;
        uint256 principalOutstanding;
        uint256 unresolvedWrittenOffLoans;
        uint256[] activeLoanIds;
    }
    struct Loan {
        address borrower;
        bytes32 batchRef;
        uint128 originalPrincipal;
        uint128 principalOutstanding;
        uint256 interestAccrued;
        uint256 accrualRemainder;
        uint64 drawnAt;
        uint64 dueAt;
        uint64 lastAccruedAt;
        LoanStatus status;
    }
    struct RedemptionRequest {
        address owner;
        uint256 shares;
        uint64 requestedAt;
        RedemptionStatus status;
    }
    struct PoolSnapshot {
        uint256 cash;
        uint256 principal;
        uint256 interest;
        uint256 nav;
        uint256 shares;
        bool hasOverdue;
        uint256 pendingRequests;
        uint256 queueHead;
        uint256 queueTail;
        bool depositsPaused;
        bool drawsPaused;
        uint256 interestPaid;
        uint256 writtenOff;
        uint256 recovered;
        uint64 timestamp;
    }

    error UnexpectedAssetDecimals();
    error InvalidConfiguration();
    error InvalidAmount();
    error InvalidReceiver();
    error DepositsUnavailable();
    error MinimumSharesNotMet(uint256 actual, uint256 minimum);
    error QueuedExitsOnly();
    error DrawUnavailable(DrawBlockReason reason);
    error LoanNotFound();
    error LoanAlreadySettled();
    error RepaymentExceedsDebt(uint256 debt);
    error RepaymentBoundExceeded(uint256 debt, uint256 maximum);
    error MemoTransferFailed();
    error IncorrectReceivedAmount();
    error LoanNotOverdue();
    error RedemptionTooSmall();
    error ExistingRedemption();
    error InvalidRedemption();
    error NotRequestOwner();
    error OverdueLoansBlockProcessing();
    error InvalidProcessingLimit();

    event BorrowerConfigured(address indexed borrower, bool enabled, uint128 creditLimit, uint64 maxTenorSeconds, bytes32 diligenceHash);
    event LoanDrawn(uint256 indexed loanId, address indexed borrower, bytes32 indexed batchRef, uint256 principal, uint64 dueAt);
    event LoanRepaid(uint256 indexed loanId, address indexed payer, uint256 assets, uint256 paidInterest, uint256 paidPrincipal);
    event SettlementRepaid(uint256 indexed loanId, address indexed payer, address indexed borrower, bytes32 batchRef, uint256 assets);
    event LoanWrittenOff(uint256 indexed loanId, address indexed borrower, uint256 carryingValue, bytes32 reasonHash);
    event LoanRecovered(uint256 indexed loanId, address indexed payer, uint256 assets, uint256 paidInterest, uint256 paidPrincipal);
    event RedemptionRequested(uint256 indexed requestId, address indexed owner, uint256 shares);
    event RedemptionCancelled(uint256 indexed requestId, address indexed owner, uint256 shares);
    event RedemptionProcessed(uint256 indexed requestId, address indexed owner, uint256 shares, uint256 assets);
    event PauseChanged(bool depositsPaused, bool drawsPaused);

    mapping(address => BorrowerConfig) private _borrowers;
    mapping(address => uint256) public principalExposure;
    mapping(address => uint256) public unresolvedWrittenOffLoans;
    mapping(address => mapping(bytes32 => uint256)) public loanForBatch;
    mapping(uint256 => Loan) private _loans;
    uint256[] private _activeLoanIds;
    mapping(address => uint256[]) private _borrowerActiveLoanIds;
    mapping(uint256 => uint256) private _activeIndex;
    mapping(uint256 => uint256) private _borrowerActiveIndex;

    mapping(uint256 => RedemptionRequest) private _redemptions;
    mapping(address => uint256) public pendingRequestOf;
    uint256 public nextLoanId = 1;
    uint256 public nextRedemptionId = 1;
    uint256 public queueHead = 1;
    uint256 public pendingRequests;
    bool public depositsPaused;
    bool public drawsPaused;
    uint256 public cumulativeInterestPaid;
    uint256 public cumulativeWrittenOff;
    uint256 public cumulativeRecovered;

    constructor(IERC20 token, address manager)
        ERC20("Payment Finance Vault Share", "tPF") ERC4626(token) Ownable(manager)
    {
        if (IERC20Metadata(address(token)).decimals() != 6 || decimals() != 18) revert UnexpectedAssetDecimals();
    }

    function _decimalsOffset() internal pure override returns (uint8) { return 12; }

    function totalAssets() public view override returns (uint256 assets) {
        assets = IERC20(asset()).balanceOf(address(this));
        for (uint256 i; i < _activeLoanIds.length; ++i) {
            Loan storage loan = _loans[_activeLoanIds[i]];
            assets += loan.principalOutstanding + _previewInterest(loan);
        }
    }

    function maxDeposit(address receiver) public view override returns (uint256) {
        if (receiver == address(0) || receiver == address(this) || depositsPaused || (totalSupply() != 0 && totalAssets() == 0)) return 0;
        return type(uint256).max;
    }
    function maxMint(address receiver) public view override returns (uint256) { return maxDeposit(receiver); }
    function maxWithdraw(address) public pure override returns (uint256) { return 0; }
    function maxRedeem(address) public pure override returns (uint256) { return 0; }
    function _withdraw(address, address, address, uint256, uint256) internal pure override { revert QueuedExitsOnly(); }

    function _deposit(address caller, address receiver, uint256 assets, uint256 shares) internal override nonReentrant {
        if (depositsPaused || (totalSupply() != 0 && totalAssets() == 0)) revert DepositsUnavailable();
        if (receiver == address(this) || receiver == address(0)) revert InvalidReceiver();
        if (assets == 0 || shares == 0) revert InvalidAmount();
        uint256 beforeBalance = IERC20(asset()).balanceOf(address(this));
        super._deposit(caller, receiver, assets, shares);
        if (IERC20(asset()).balanceOf(address(this)) != beforeBalance + assets) revert IncorrectReceivedAmount();
    }

    function depositWithMinShares(uint256 assets, address receiver, uint256 minShares) external returns (uint256 shares) {
        shares = previewDeposit(assets);
        if (shares < minShares) revert MinimumSharesNotMet(shares, minShares);
        return deposit(assets, receiver);
    }

    function transfer(address to, uint256 value) public override(ERC20, IERC20) returns (bool) {
        if (to == address(this)) revert InvalidReceiver();
        return super.transfer(to, value);
    }
    function transferFrom(address from, address to, uint256 value) public override(ERC20, IERC20) returns (bool) {
        if (to == address(this)) revert InvalidReceiver();
        return super.transferFrom(from, to, value);
    }

    function configureBorrower(address borrower, bool enabled, uint128 creditLimit, uint64 maxTenorSeconds, bytes32 diligenceHash) external onlyOwner {
        if (borrower == address(0) || creditLimit == 0 || maxTenorSeconds < MIN_TENOR_SECONDS || diligenceHash == bytes32(0)) revert InvalidConfiguration();
        _borrowers[borrower] = BorrowerConfig(enabled, creditLimit, maxTenorSeconds, diligenceHash);
        emit BorrowerConfigured(borrower, enabled, creditLimit, maxTenorSeconds, diligenceHash);
    }
    function setPauses(bool pauseDeposits, bool pauseDraws) external onlyOwner {
        depositsPaused = pauseDeposits;
        drawsPaused = pauseDraws;
        emit PauseChanged(pauseDeposits, pauseDraws);
    }

    function _borrowerRestriction(address borrower) internal view returns (DrawBlockReason) {
        if (!_borrowers[borrower].enabled) return DrawBlockReason.NotApproved;
        if (unresolvedWrittenOffLoans[borrower] != 0) return DrawBlockReason.UnresolvedDefault;
        if (drawsPaused) return DrawBlockReason.BorrowingPaused;
        uint256[] storage ids = _borrowerActiveLoanIds[borrower];
        for (uint256 i; i < ids.length; ++i) if (_isOverdue(_loans[ids[i]])) return DrawBlockReason.BorrowerOverdue;
        if (pendingRequests != 0) return DrawBlockReason.RedemptionsPending;
        return DrawBlockReason.Available;
    }
    function _atLoanLimit(address borrower) internal view returns (bool) {
        return _activeLoanIds.length >= MAX_ACTIVE_LOANS || _borrowerActiveLoanIds[borrower].length >= MAX_BORROWER_LOANS;
    }
    function availableCredit(address borrower) public view returns (uint256) {
        uint256 limit = _borrowers[borrower].creditLimit;
        uint256 exposure = principalExposure[borrower];
        return exposure < limit ? limit - exposure : 0;
    }
    function _availableLiquidity() internal view returns (uint256) {
        uint256 cash = IERC20(asset()).balanceOf(address(this));
        uint256 reserve = Math.ceilDiv(totalAssets(), 10);
        return cash > reserve ? cash - reserve : 0;
    }
    function availableToDraw(address borrower) external view returns (uint256 amount, DrawBlockReason reason) {
        reason = _borrowerRestriction(borrower);
        if (reason != DrawBlockReason.Available) return (0, reason);
        if (_atLoanLimit(borrower)) return (0, DrawBlockReason.ActiveLoanLimit);
        uint256 credit = availableCredit(borrower);
        if (credit == 0) return (0, DrawBlockReason.CreditLimit);
        amount = Math.min(credit, _availableLiquidity());
        if (amount == 0) reason = DrawBlockReason.LiquidityReserve;
    }
    function draw(uint128 amount, uint64 tenorSeconds, bytes32 batchRef) external nonReentrant returns (uint256 loanId) {
        DrawBlockReason reason = _borrowerRestriction(msg.sender);
        if (reason != DrawBlockReason.Available) revert DrawUnavailable(reason);
        BorrowerConfig storage config = _borrowers[msg.sender];
        if (amount == 0 || tenorSeconds < MIN_TENOR_SECONDS || tenorSeconds > config.maxTenorSeconds || batchRef == bytes32(0) || loanForBatch[msg.sender][batchRef] != 0) revert DrawUnavailable(DrawBlockReason.InvalidRequest);
        if (_atLoanLimit(msg.sender)) revert DrawUnavailable(DrawBlockReason.ActiveLoanLimit);
        if (amount > availableCredit(msg.sender)) revert DrawUnavailable(DrawBlockReason.CreditLimit);
        if (amount > _availableLiquidity()) revert DrawUnavailable(DrawBlockReason.LiquidityReserve);

        loanId = nextLoanId++;
        Loan storage loan = _loans[loanId];
        loan.borrower = msg.sender;
        loan.batchRef = batchRef;
        loan.originalPrincipal = amount;
        loan.principalOutstanding = amount;
        loan.drawnAt = uint64(block.timestamp);
        loan.dueAt = uint64(block.timestamp) + tenorSeconds;
        loan.lastAccruedAt = uint64(block.timestamp);
        loan.status = LoanStatus.Active;
        loanForBatch[msg.sender][batchRef] = loanId;
        principalExposure[msg.sender] += amount;
        _activeIndex[loanId] = _activeLoanIds.length;
        _activeLoanIds.push(loanId);
        _borrowerActiveIndex[loanId] = _borrowerActiveLoanIds[msg.sender].length;
        _borrowerActiveLoanIds[msg.sender].push(loanId);
        ITIP20(asset()).transferWithMemo(msg.sender, amount, batchRef);
        emit LoanDrawn(loanId, msg.sender, batchRef, amount, loan.dueAt);
    }

    function _previewInterest(Loan storage loan) internal view returns (uint256) {
        if (loan.status != LoanStatus.Active) return loan.interestAccrued;
        uint256 numerator = uint256(loan.principalOutstanding) * APR_BPS * (block.timestamp - loan.lastAccruedAt) + loan.accrualRemainder;
        return loan.interestAccrued + numerator / INTEREST_DENOMINATOR;
    }
    function _checkpoint(Loan storage loan) internal {
        if (loan.status != LoanStatus.Active) return;
        uint256 numerator = uint256(loan.principalOutstanding) * APR_BPS * (block.timestamp - loan.lastAccruedAt) + loan.accrualRemainder;
        loan.interestAccrued += numerator / INTEREST_DENOMINATOR;
        loan.accrualRemainder = numerator % INTEREST_DENOMINATOR;
        loan.lastAccruedAt = uint64(block.timestamp);
    }
    function previewDebt(uint256 loanId) public view returns (uint256 principal, uint256 interest, uint256 total) {
        Loan storage loan = _loans[loanId];
        if (loan.status == LoanStatus.None) revert LoanNotFound();
        principal = loan.principalOutstanding;
        interest = _previewInterest(loan);
        total = principal + interest;
    }
    function repay(uint256 loanId, uint256 assets) external nonReentrant returns (uint256 paidInterest, uint256 paidPrincipal) {
        return _repay(loanId, msg.sender, assets);
    }
    function repayAll(uint256 loanId, uint256 maxAssets) external nonReentrant returns (uint256 assetsPaid) {
        return _repayAll(loanId, msg.sender, maxAssets);
    }
    function repaySettlement(address borrower, bytes32 batchRef, uint256 maxAssets) external nonReentrant returns (uint256 assetsPaid) {
        uint256 loanId = loanForBatch[borrower][batchRef];
        if (loanId == 0) revert LoanNotFound();
        assetsPaid = _repayAll(loanId, msg.sender, maxAssets);
        emit SettlementRepaid(loanId, msg.sender, borrower, batchRef, assetsPaid);
    }
    function _repayAll(uint256 loanId, address payer, uint256 maxAssets) internal returns (uint256 assetsPaid) {
        (,, assetsPaid) = previewDebt(loanId);
        if (assetsPaid > maxAssets) revert RepaymentBoundExceeded(assetsPaid, maxAssets);
        _repay(loanId, payer, assetsPaid);
    }
    function _repay(uint256 loanId, address payer, uint256 assets) internal returns (uint256 paidInterest, uint256 paidPrincipal) {
        Loan storage loan = _loans[loanId];
        if (loan.status == LoanStatus.None) revert LoanNotFound();
        if (loan.status == LoanStatus.Settled) revert LoanAlreadySettled();
        if (assets == 0) revert InvalidAmount();
        _checkpoint(loan);
        uint256 debt = uint256(loan.principalOutstanding) + loan.interestAccrued;
        if (assets > debt) revert RepaymentExceedsDebt(debt);
        bool recovery = loan.status == LoanStatus.WrittenOff;
        paidInterest = Math.min(assets, loan.interestAccrued);
        paidPrincipal = assets - paidInterest;
        loan.interestAccrued -= paidInterest;
        loan.principalOutstanding -= uint128(paidPrincipal);
        principalExposure[loan.borrower] -= paidPrincipal;
        cumulativeInterestPaid += paidInterest;
        if (recovery) cumulativeRecovered += assets;
        if (loan.principalOutstanding == 0 && loan.interestAccrued == 0) {
            loan.accrualRemainder = 0;
            if (recovery) {
                --unresolvedWrittenOffLoans[loan.borrower];
                _borrowers[loan.borrower].enabled = false;
            } else _removeActive(loanId, loan.borrower);
            loan.status = LoanStatus.Settled;
        }
        uint256 beforeBalance = IERC20(asset()).balanceOf(address(this));
        if (!ITIP20(asset()).transferFromWithMemo(payer, address(this), assets, loan.batchRef)) revert MemoTransferFailed();
        if (IERC20(asset()).balanceOf(address(this)) != beforeBalance + assets) revert IncorrectReceivedAmount();
        if (recovery) emit LoanRecovered(loanId, payer, assets, paidInterest, paidPrincipal);
        emit LoanRepaid(loanId, payer, assets, paidInterest, paidPrincipal);
    }

    function _isOverdue(Loan storage loan) internal view returns (bool) {
        return loan.status == LoanStatus.Active && block.timestamp > loan.dueAt && (loan.principalOutstanding != 0 || loan.interestAccrued != 0);
    }
    function hasOverdueLoans() public view returns (bool) {
        for (uint256 i; i < _activeLoanIds.length; ++i) if (_isOverdue(_loans[_activeLoanIds[i]])) return true;
        return false;
    }
    function writeOff(uint256 loanId, bytes32 reasonHash) external onlyOwner nonReentrant {
        Loan storage loan = _loans[loanId];
        if (!_isOverdue(loan)) revert LoanNotOverdue();
        if (reasonHash == bytes32(0)) revert InvalidConfiguration();
        _checkpoint(loan);
        uint256 carryingValue = uint256(loan.principalOutstanding) + loan.interestAccrued;
        cumulativeWrittenOff += carryingValue;
        loan.status = LoanStatus.WrittenOff;
        _removeActive(loanId, loan.borrower);
        _borrowers[loan.borrower].enabled = false;
        ++unresolvedWrittenOffLoans[loan.borrower];
        emit LoanWrittenOff(loanId, loan.borrower, carryingValue, reasonHash);
    }
    function _removeActive(uint256 loanId, address borrower) internal {
        uint256 index = _activeIndex[loanId];
        uint256 last = _activeLoanIds[_activeLoanIds.length - 1];
        _activeLoanIds[index] = last;
        _activeIndex[last] = index;
        _activeLoanIds.pop();
        delete _activeIndex[loanId];
        uint256[] storage ids = _borrowerActiveLoanIds[borrower];
        index = _borrowerActiveIndex[loanId];
        last = ids[ids.length - 1];
        ids[index] = last;
        _borrowerActiveIndex[last] = index;
        ids.pop();
        delete _borrowerActiveIndex[loanId];
    }

    function requestRedeem(uint256 shares) external nonReentrant returns (uint256 requestId) {
        if (shares < MIN_REDEMPTION_SHARES) revert RedemptionTooSmall();
        if (pendingRequestOf[msg.sender] != 0) revert ExistingRedemption();
        _transfer(msg.sender, address(this), shares);
        requestId = nextRedemptionId++;
        _redemptions[requestId] = RedemptionRequest(msg.sender, shares, uint64(block.timestamp), RedemptionStatus.Pending);
        pendingRequestOf[msg.sender] = requestId;
        ++pendingRequests;
        emit RedemptionRequested(requestId, msg.sender, shares);
    }
    function cancelRedeem(uint256 requestId) external nonReentrant {
        RedemptionRequest storage request = _redemptions[requestId];
        if (request.status != RedemptionStatus.Pending) revert InvalidRedemption();
        if (request.owner != msg.sender) revert NotRequestOwner();
        request.status = RedemptionStatus.Cancelled;
        delete pendingRequestOf[request.owner];
        --pendingRequests;
        _transfer(address(this), request.owner, request.shares);
        emit RedemptionCancelled(requestId, request.owner, request.shares);
    }
    function processRedemptions(uint256 maxEntries) external nonReentrant returns (uint256 processed) {
        if (maxEntries == 0 || maxEntries > MAX_QUEUE_ENTRIES) revert InvalidProcessingLimit();
        if (hasOverdueLoans()) revert OverdueLoansBlockProcessing();
        uint256 examined;
        while (queueHead < nextRedemptionId && examined < maxEntries) {
            RedemptionRequest storage request = _redemptions[queueHead];
            ++examined;
            if (request.status != RedemptionStatus.Pending) { ++queueHead; continue; }
            uint256 assets = previewRedeem(request.shares);
            if (assets > IERC20(asset()).balanceOf(address(this))) break;
            uint256 requestId = queueHead++;
            request.status = RedemptionStatus.Processed;
            delete pendingRequestOf[request.owner];
            --pendingRequests;
            _burn(address(this), request.shares);
            if (assets != 0) IERC20(asset()).safeTransfer(request.owner, assets);
            ++processed;
            emit RedemptionProcessed(requestId, request.owner, request.shares, assets);
        }
    }

    function getBorrower(address borrower) external view returns (BorrowerView memory) {
        return BorrowerView(_borrowers[borrower], principalExposure[borrower], unresolvedWrittenOffLoans[borrower], _borrowerActiveLoanIds[borrower]);
    }
    function getLoan(uint256 loanId) external view returns (Loan memory) { return _loans[loanId]; }
    function getActiveLoanIds() external view returns (uint256[] memory) { return _activeLoanIds; }
    function getBorrowerActiveLoanIds(address borrower) external view returns (uint256[] memory) { return _borrowerActiveLoanIds[borrower]; }
    function getRedemption(uint256 requestId) external view returns (RedemptionRequest memory) { return _redemptions[requestId]; }
    function getPoolSnapshot() external view returns (PoolSnapshot memory snapshot) {
        snapshot.cash = IERC20(asset()).balanceOf(address(this));
        for (uint256 i; i < _activeLoanIds.length; ++i) {
            Loan storage loan = _loans[_activeLoanIds[i]];
            snapshot.principal += loan.principalOutstanding;
            snapshot.interest += _previewInterest(loan);
            if (_isOverdue(loan)) snapshot.hasOverdue = true;
        }
        snapshot.nav = snapshot.cash + snapshot.principal + snapshot.interest;
        snapshot.shares = totalSupply();
        snapshot.pendingRequests = pendingRequests;
        snapshot.queueHead = queueHead;
        snapshot.queueTail = nextRedemptionId - 1;
        snapshot.depositsPaused = depositsPaused;
        snapshot.drawsPaused = drawsPaused;
        snapshot.interestPaid = cumulativeInterestPaid;
        snapshot.writtenOff = cumulativeWrittenOff;
        snapshot.recovered = cumulativeRecovered;
        snapshot.timestamp = uint64(block.timestamp);
    }
}
