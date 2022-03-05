// SPDX-License-Identifier: Unlicensed

pragma solidity 0.8.12;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeCastUpgradeable.sol";

import "./ExtraStorageGap.sol";
import "./interface/IDoubleDiceAdmin.sol";
import "./library/AddressWhitelists.sol";
import "./library/ERC1155TokenIds.sol";
import "./library/FixedPointTypes.sol";
import "./library/Utils.sol";
import "./library/VirtualFloorCreationParamsUtils.sol";
import "./library/VirtualFloors.sol";
import "./MultipleInheritanceOptimization.sol";

/// @dev 255 not 256, because we store nOutcomes in a uint8
uint256 constant _MAX_OUTCOMES_PER_VIRTUAL_FLOOR = 255;

UFixed256x18 constant _BETA_CLOSE = UFIXED256X18_ONE;

// ToDo: Can we optimize this by using uint128 and packing both values into 1 slot,
// or will amountTimesBeta_e18 then not have enough precision?
struct OutcomeTotals {
    uint256 amount;
    UFixed256x18 amountTimesBeta_e18;
}

enum VirtualFloorInternalState {
    None,

    /// @dev Running if t < tClose else Closed
    /// Running means that the VirtualFloor is accepting commitments
    /// Closed means that the VirtualFloor is no longer accepting commitments,
    /// but the associated event has not yet been resolved.
    RunningOrClosed,

    ResolvedWinners,

    /// @dev At tClose there were commitments to less than 2 outcomes,
    /// so the VF could not possibly be concluded.
    CancelledUnresolvable,

    /// @dev The VF was resolved, but to an outcome that had 0 commitments
    CancelledResolvedNoWinners,

    /// @dev The VF was flagged by the community and cancelled by the admin
    CancelledFlagged
}

struct VirtualFloor {

    // Storage slot 0: Written to during createVirtualFloor, only read from thereafter
    uint8 nOutcomes;                      // +  1 byte
    uint32 tOpen;                         // +  4 bytes
    uint32 tClose;                        // +  4 bytes 
    uint32 tResolve;                      // +  4 bytes
    UFixed32x6 betaOpenMinusBetaClose;    // +  4 bytes ; fits with 6-decimal-place precision all values up to ~4000.000000
    UFixed16x4 creationFeeRate;           // +  2 bytes ; fits with 4-decimal-place precision entire range [0.0000, 1.0000]
    UFixed16x4 platformFeeRate;           // +  2 bytes ; fits with 4-decimal-place precision entire range [0.0000, 1.0000]
    AddressWhitelistKey _paymentTokenKey; // + 10 bytes
                                          // = 31 bytes => packed into 1 32-byte slot

    // Storage slot 1: Slot written to during createVirtualFloor, and updated throughout VF lifecycle
    address creator;                          //   20 bytes
    VirtualFloorInternalState _internalState; // +  1 byte
    uint8 nonzeroOutcomeCount;                // +  1 byte  ; number of outcomes having aggregate commitments > 0
                                              // = 22 bytes => packed into 1 32-byte slot

    // Storage slot 2: Not written to, but used in calculation of outcome-specific slots
    // Note: A fixed-length array is used to not an entire 32-byte slot to write array-length,
    // but instead store the length in 1 byte in `nOutcomes`
    OutcomeTotals[_MAX_OUTCOMES_PER_VIRTUAL_FLOOR] outcomeTotals;

    // Storage slot 3: Slot written to during resolve
    uint8 winningOutcomeIndex; // +  1 byte
    uint192 winnerProfits;     // + 24 bytes ; fits with 18-decimal-place precision all values up to ~1.5e30 (and with less decimals, more)
                               // = 25 bytes => packed into 1 32-byte slot

    uint256 bonusAmount;

    // Pack into 1 storage slot
    // _prefixed as they are not meant to be read directly,
    // but through .minMaxCommitmentAmounts() 
    uint128 _optionalMinCommitmentAmount;
    uint128 _optionalMaxCommitmentAmount;
}

abstract contract BaseDoubleDice is
    IDoubleDiceAdmin,
    ERC1155Upgradeable,
    AccessControlUpgradeable,
    PausableUpgradeable,
    ExtraStorageGap,
    MultipleInheritanceOptimization
{
    using AddressWhitelists for address;
    using AddressWhitelists for AddressWhitelist;
    using FixedPointTypes for UFixed16x4;
    using FixedPointTypes for UFixed256x18;
    using FixedPointTypes for UFixed32x6;
    using FixedPointTypes for uint256;
    using SafeCastUpgradeable for uint256;
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using Utils for uint256;
    using VirtualFloorCreationParamsUtils for VirtualFloorCreationParams;
    using VirtualFloors for VirtualFloor;

    // ---------- Storage ----------

    address private _platformFeeBeneficiary;

    UFixed16x4 private _platformFeeRate;

    mapping(uint256 => VirtualFloor) private _vfs;

    AddressWhitelist private _paymentTokenWhitelist;


    // ---------- Setup & config ----------

    struct BaseDoubleDiceInitParams {
        string tokenMetadataUriTemplate;
        UFixed256x18 platformFeeRate_e18;
        address platformFeeBeneficiary;
    }

    function __BaseDoubleDice_init(BaseDoubleDiceInitParams calldata params)
        internal
        onlyInitializing
        multipleInheritanceRootInitializer
    {
        __ERC1155_init(params.tokenMetadataUriTemplate);
        __AccessControl_init();
        __Pausable_init();
        _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());
        _setPlatformFeeRate(params.platformFeeRate_e18);
        _setPlatformFeeBeneficiary(params.platformFeeBeneficiary);
    }


    // ---------- External setters, exclusive to ADMIN ----------

    function setTokenMetadataUriTemplate(string calldata template) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setURI(template);
    }

    function setPlatformFeeBeneficiary(address platformFeeBeneficiary_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setPlatformFeeBeneficiary(platformFeeBeneficiary_);
    }

    function setPlatformFeeRate_e18(UFixed256x18 platformFeeRate_e18_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setPlatformFeeRate(platformFeeRate_e18_);
    }

    function updatePaymentTokenWhitelist(IERC20Upgradeable token, bool isWhitelisted) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _updatePaymentTokenWhitelist(token, isWhitelisted);
    }


    // ---------- Internal setters ----------

    function _setPlatformFeeBeneficiary(address platformFeeBeneficiary_) internal {
        _platformFeeBeneficiary = platformFeeBeneficiary_;
        emit PlatformFeeBeneficiaryUpdate(platformFeeBeneficiary_);
    }

    function _setPlatformFeeRate(UFixed256x18 platformFeeRate) internal {
        require(platformFeeRate.lte(UFIXED256X18_ONE), "Error: platformFeeRate > 1.0");
        _platformFeeRate = platformFeeRate.toUFixed16x4();
        emit PlatformFeeRateUpdate(platformFeeRate);
    }

    function _updatePaymentTokenWhitelist(IERC20Upgradeable token, bool isWhitelisted) internal {
        _paymentTokenWhitelist.setWhitelistStatus(address(token), isWhitelisted);
        emit PaymentTokenWhitelistUpdate(token, isWhitelisted);
    }


    function _paymentTokenOf(VirtualFloor storage vf) internal view returns (IERC20Upgradeable) {
        return IERC20Upgradeable(_paymentTokenWhitelist.addressForKey(vf._paymentTokenKey));
    }


    // ---------- Public getters ----------

    uint256 constant public TIMESLOT_DURATION = 60 seconds;

    function platformFeeBeneficiary() public view returns (address) {
        return _platformFeeBeneficiary;
    }

    /// @notice The current platform-fee rate as a proportion of the creator-fee taken
    /// on virtualfloor resolution.
    /// E.g. 1.25% would be returned as 0.0125e18
    function platformFeeRate_e18() external view returns (UFixed256x18) {
        return _platformFeeRate.toUFixed256x18();
    }

    function isPaymentTokenWhitelisted(IERC20Upgradeable token) public view returns (bool) {
        return _paymentTokenWhitelist.isWhitelisted(address(token));
    }

    function getVirtualFloorState(uint256 vfId) public view returns (VirtualFloorState) {
        return _vfs[vfId].state();
    }

    function getVirtualFloorCreator(uint256 vfId) public view returns (address) {
        return _vfs[vfId].creator;
    }

    function getVirtualFloorParams(uint256 vfId) public view returns (VirtualFloorParams memory) {
        VirtualFloor storage vf = _vfs[vfId];
        (uint256 minCommitmentAmount, uint256 maxCommitmentAmount) = vf.minMaxCommitmentAmounts();
        return VirtualFloorParams({
            betaOpen_e18: vf.betaOpenMinusBetaClose.toUFixed256x18().add(_BETA_CLOSE),
            creationFeeRate_e18: vf.creationFeeRate.toUFixed256x18(),
            platformFeeRate_e18: vf.platformFeeRate.toUFixed256x18(),
            tOpen: vf.tOpen,
            tClose: vf.tClose,
            tResolve: vf.tResolve,
            nOutcomes: vf.nOutcomes,
            paymentToken: _paymentTokenOf(vf),
            bonusAmount: vf.bonusAmount,
            minCommitmentAmount: minCommitmentAmount,
            maxCommitmentAmount: maxCommitmentAmount,
            creator: vf.creator
        });
    }

    function getVirtualFloorOutcomeTotals(uint256 vfId, uint8 outcomeIndex) public view returns (OutcomeTotals memory) {
        return _vfs[vfId].outcomeTotals[outcomeIndex];
    }


    // ---------- Virtual-floor lifecycle ----------

    function createVirtualFloor(VirtualFloorCreationParams calldata params)
        public
        whenNotPaused
    {

        // Pure value validation
        params.validatePure();

        // Validation against block
        require(block.timestamp <= params.tCreateMax(), "Error: t >= 10% into open period");

        VirtualFloor storage vf = _vfs[params.virtualFloorId];

        // Validation against storage
        require(vf._internalState == VirtualFloorInternalState.None, "MARKET_DUPLICATE");
        require(_paymentTokenWhitelist.isWhitelisted(address(params.paymentToken)), "Error: Payment token is not whitelisted");

        vf._internalState = VirtualFloorInternalState.RunningOrClosed;
        vf.creator = _msgSender();
        vf.betaOpenMinusBetaClose = params.betaOpen_e18.sub(_BETA_CLOSE).toUFixed32x6();
        vf.creationFeeRate = params.creationFeeRate_e18.toUFixed16x4();
        vf.platformFeeRate = _platformFeeRate; // freeze current global platformFeeRate
        vf.tOpen = params.tOpen;
        vf.tClose = params.tClose;
        vf.tResolve = params.tResolve;
        vf.nOutcomes = params.nOutcomes;
        vf._paymentTokenKey = address(params.paymentToken).toAddressWhitelistKey();

        if (params.bonusAmount > 0) {
            vf.bonusAmount = params.bonusAmount;

            // For the purpose of knowing whether a VF is unresolvable,
            // the bonus amount is equivalent to a commitment to a "virtual" outcome
            // that never wins, but only serves the purpose of increasing the total
            // amount committed to the VF
            vf.nonzeroOutcomeCount += 1;

            params.paymentToken.safeTransferFrom(_msgSender(), address(this), params.bonusAmount);
        }

        uint256 min;
        uint256 max;
        {
            // ToDo: Does it save gas to skip if == 0 ?
            // First store raw values ...
            vf._optionalMinCommitmentAmount = params.optionalMinCommitmentAmount.toUint128();
            vf._optionalMaxCommitmentAmount = params.optionalMaxCommitmentAmount.toUint128();
            // ... then validate values returned through the library getter.
            (min, max) = vf.minMaxCommitmentAmounts();
            require(
                _MIN_POSSIBLE_COMMITMENT_AMOUNT <= min
                                                && min <= max
                                                       && max <= _MAX_POSSIBLE_COMMITMENT_AMOUNT,
                "ERROR"
            );
        }

        // Extracting this value to a local variable
        // averts a "Stack too deep" CompilerError in the
        // subsequent `emit`
        EncodedVirtualFloorMetadata calldata metadata = params.metadata;

        emit VirtualFloorCreation({
            virtualFloorId: params.virtualFloorId,
            creator: vf.creator,
            betaOpen_e18: params.betaOpen_e18,
            creationFeeRate_e18: params.creationFeeRate_e18,
            platformFeeRate_e18: _platformFeeRate.toUFixed256x18(),
            tOpen: params.tOpen,
            tClose: params.tClose,
            tResolve: params.tResolve,
            nOutcomes: params.nOutcomes,
            paymentToken: params.paymentToken,
            bonusAmount: params.bonusAmount,
            minCommitmentAmount: min,
            maxCommitmentAmount: max,
            metadata: metadata
        });

        // Hooks might want to read VF values from storage,
        // so hook-call must happen last.
        _onVirtualFloorCreation(params);
    }

    function commitToVirtualFloor(uint256 vfId, uint8 outcomeIndex, uint256 amount)
        public
        whenNotPaused
    {
        VirtualFloor storage vf = _vfs[vfId];

        require(vf.state() == VirtualFloorState.Running, "MARKET_NOT_FOUND|MARKET_CLOSED");

        require(outcomeIndex < vf.nOutcomes, "OUTCOME_INDEX_OUT_OF_RANGE");

        (uint256 minAmount, uint256 maxAmount) = vf.minMaxCommitmentAmounts();
        require(minAmount <= amount && amount <= maxAmount, "ERROR");

        _paymentTokenOf(vf).safeTransferFrom(_msgSender(), address(this), amount);

        // Assign all commitments that happen within the same `_TIMESLOT_DURATION`, to the same "timeslot."
        // These commitments will all be assigned the same associated beta value.
        // If `_TIMESLOT_DURATION` is set to 1 minute, then the following line converts
        // all 2022-01-11T15:47:XX to 2022-01-11T15:47:00,
        // and this rounded-down timestamp is used as the "timeslot identifier".
        uint256 timeslot = block.timestamp - (block.timestamp % TIMESLOT_DURATION);

        // Commitments made at t < tOpen will all be accumulated into the same timeslot == tOpen,
        // and will therefore be assigned the same beta == betaOpen.
        // This means that all commitments to a specific outcome that happen at t <= tOpen
        // (actually up to t < tOpen + _TIMESLOT_DURATION)
        // will be minted as balances on the the same ERC-1155 tokenId, which means that
        // these balances will be exchangeable/tradeable/fungible between themselves,
        // but they will not be fungible with commitments to the same outcome that arrive later.
        timeslot = MathUpgradeable.max(vf.tOpen, timeslot);

        UFixed256x18 beta_e18 = vf.betaOf(timeslot);
        OutcomeTotals storage outcomeTotals = vf.outcomeTotals[outcomeIndex];

        // Only increment this counter the first time an outcome is committed to.
        // In this way, this counter will be updated maximum nOutcome times over the entire commitment period.
        // Some gas could be saved here by marking as unchecked, and by not counting beyond 2,
        // but we choose to forfeit these micro-optimizations to retain simplicity.
        if (outcomeTotals.amount == 0) {
            vf.nonzeroOutcomeCount += 1;
        }

        outcomeTotals.amount += amount;
        outcomeTotals.amountTimesBeta_e18 = outcomeTotals.amountTimesBeta_e18.add(beta_e18.mul0(amount));

        uint256 tokenId = ERC1155TokenIds.vfOutcomeTimeslotIdOf(vfId, outcomeIndex, timeslot);

        // From the Graph's point of view...
        // First we declare the parameters bound to a particular tokenId...
        emit UserCommitment({
            virtualFloorId: vfId,
            committer: _msgSender(),
            outcomeIndex: outcomeIndex,
            timeslot: timeslot,
            amount: amount,
            beta_e18: beta_e18,
            tokenId: tokenId
        });

        // ... and only then do we refer to it in transfers.
        _mint({
            to: _msgSender(),
            id: tokenId,
            amount: amount,
            data: hex""
        });
    }

    /// @dev Hook into transfer process to block transfers of
    /// commitment-type token balances that are tied to virtual-floors
    /// that are in the wrong state and time-period.
    function _beforeTokenTransfer(
        address operator,
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    )
        internal
        override
        // non-virtual, to prevent extending contracts from altering core behaviour
    {
        super._beforeTokenTransfer(operator, from, to, ids, amounts, data);

        // No restrictions on mint/burn
        if (from == address(0) || to == address(0)) {
            return;
        }

        for (uint256 i = 0; i < ids.length; i++) {
            uint256 id = ids[i];
            uint256 vfId = ERC1155TokenIds.extractVirtualFloorId(id);
            VirtualFloor storage vf = _vfs[vfId];
            VirtualFloorState state = vf.state();
            if (state != VirtualFloorState.ClosedPreResolvable) {
                revert CommitmentBalanceTransferRejection(id, state);
            }
        }
    }

    /// @notice A virtual-floor's commitment period closes at `tClose`.
    /// If at this point there are zero commitments to zero outcomes,
    /// or there are > 0 commitments, but all to a single outcome,
    /// then this virtual-floor is considered unconcludeable.
    /// For such a virtual-floor:
    /// 1. The only possible action for this virtual-floor is to cancel it via this function,
    ///    which may be invoked by anyone without restriction.
    /// 2. Any ERC-1155 commitment-type token balance associated with this virtual-floor is untransferable
    function cancelVirtualFloorUnresolvable(uint256 vfId)
        public
        whenNotPaused
    {
        VirtualFloor storage vf = _vfs[vfId];
        require(vf.state() == VirtualFloorState.ClosedUnresolvable, "MARKET_INEXISTENT_OR_IN_WRONG_STATE|TOO_EARLY|Error: VF only unresolvable if commitments to less than 2 outcomes");
        vf._internalState = VirtualFloorInternalState.CancelledUnresolvable;
        emit VirtualFloorCancellationUnresolvable(vfId);
        _onVirtualFloorConclusion(vfId);
    }

    function cancelVirtualFloorFlagged(uint256 vfId, string calldata reason)
        public
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        VirtualFloor storage vf = _vfs[vfId];
        require(vf._internalState == VirtualFloorInternalState.RunningOrClosed, "MARKET_INEXISTENT_OR_IN_WRONG_STATE");
        vf._internalState = VirtualFloorInternalState.CancelledFlagged;
        emit VirtualFloorCancellationFlagged(vfId, reason);
        _onVirtualFloorConclusion(vfId);
    }

    function _resolve(uint256 vfId, uint8 winningOutcomeIndex, address creatorFeeBeneficiary) internal {
        VirtualFloor storage vf = _vfs[vfId];

        require(vf.state() == VirtualFloorState.ClosedResolvable, "MARKET_INEXISTENT_OR_IN_WRONG_STATE|TOO_EARLY_TO_RESOLVE|Error: Cannot resolve VF with commitments to less than 2 outcomes");

        require(winningOutcomeIndex < vf.nOutcomes, "OUTCOME_INDEX_OUT_OF_RANGE");

        vf.winningOutcomeIndex = winningOutcomeIndex;

        uint256 totalCommitmentsToAllOutcomesPlusBonus = vf.totalCommitmentsToAllOutcomesPlusBonus();
        uint256 totalCommitmentsToWinningOutcome = vf.outcomeTotals[winningOutcomeIndex].amount;

        // This used to be handled on this contract as a VirtualFloorResolution of type AllWinners,
        // but it can no longer happen, because if all commitments are to a single outcome,
        // transaction would have already been reverted because of
        // the condition nonzeroOutcomeCount == 1, which is < 2.
        // We retain this assertion as a form of documentation.
        assert(totalCommitmentsToWinningOutcome != totalCommitmentsToAllOutcomesPlusBonus);

        VirtualFloorResolutionType resolutionType;
        uint256 platformFeeAmount;
        uint256 creatorFeeAmount;
        uint256 totalWinnerProfits;

        if (totalCommitmentsToWinningOutcome == 0) {
            // This could happen if e.g. there are commitments to outcome #0 and outcome #1,
            // but not to outcome #2, and #2 is the winner.
            // In this case, the current ERC-1155 commitment-type token owner becomes eligible
            // to reclaim the equivalent original ERC-20 token amount,
            // i.e. to withdraw the current ERC-1155 balance as ERC-20 tokens.
            // Neither the creator nor the platform take any fees in this circumstance.
            vf._internalState = VirtualFloorInternalState.CancelledResolvedNoWinners;
            resolutionType = VirtualFloorResolutionType.CancelledNoWinners;
            platformFeeAmount = 0;
            creatorFeeAmount = 0;
            totalWinnerProfits = 0;

            _paymentTokenOf(vf).safeTransfer(vf.creator, vf.bonusAmount);
        } else {
            vf._internalState = VirtualFloorInternalState.ResolvedWinners;
            resolutionType = VirtualFloorResolutionType.Winners;

            // Winner commitments refunded, fee taken, then remainder split between winners proportionally by `commitment * beta`.
            uint256 maxTotalFeeAmount = vf.creationFeeRate.toUFixed256x18().mul0(totalCommitmentsToAllOutcomesPlusBonus).floorToUint256();

            // If needs be, limit the fee to ensure that there enough funds to be able to refund winner commitments in full.
            uint256 totalFeePlusTotalWinnerProfits = totalCommitmentsToAllOutcomesPlusBonus - totalCommitmentsToWinningOutcome;

            // ToDo: Replace Math.min with `a < b ? a : b` and check gas usage
            uint256 totalFeeAmount = MathUpgradeable.min(maxTotalFeeAmount, totalFeePlusTotalWinnerProfits);

            unchecked { // because b - min(a, b) >= 0
                totalWinnerProfits = totalFeePlusTotalWinnerProfits - totalFeeAmount;
            }
            vf.winnerProfits = totalWinnerProfits.toUint192();

            platformFeeAmount = vf.platformFeeRate.toUFixed256x18().mul0(totalFeeAmount).floorToUint256();
            _paymentTokenOf(vf).safeTransfer(_platformFeeBeneficiary, platformFeeAmount);

            unchecked { // because platformFeeRate <= 1.0
                creatorFeeAmount = totalFeeAmount - platformFeeAmount;
            }
            // _msgSender() owns the virtual-floor
            _paymentTokenOf(vf).safeTransfer(creatorFeeBeneficiary, creatorFeeAmount);
        }

        emit VirtualFloorResolution({
            virtualFloorId: vfId,
            winningOutcomeIndex: winningOutcomeIndex,
            resolutionType: resolutionType,
            winnerProfits: totalWinnerProfits,
            platformFeeAmount: platformFeeAmount,
            creatorFeeAmount: creatorFeeAmount
        });

        _onVirtualFloorConclusion(vfId);
    }

    function claim(VirtualFloorOutcomeTimeslot calldata context)
        public
        whenNotPaused
    {
        VirtualFloor storage vf = _vfs[context.virtualFloorId];
        if (vf._internalState == VirtualFloorInternalState.ResolvedWinners) {

            // ToDo: Because of this requirement, losing tokens can never be burnt... would we like to burn them? 
            require(context.outcomeIndex == vf.winningOutcomeIndex, "NOT_WINNING_OUTCOME");

            uint256 tokenId = ERC1155TokenIds.vfOutcomeTimeslotIdOf(context.virtualFloorId, context.outcomeIndex, context.timeslot);
            uint256 amount = balanceOf(_msgSender(), tokenId);
            UFixed256x18 beta = vf.betaOf(context.timeslot);
            UFixed256x18 amountTimesBeta = beta.mul0(amount);
            UFixed256x18 aggregateAmountTimesBeta = vf.outcomeTotals[vf.winningOutcomeIndex].amountTimesBeta_e18;
            uint256 profit = amountTimesBeta.mul0(vf.winnerProfits).divToUint256(aggregateAmountTimesBeta);
            uint256 payout = amount + profit;
            require(payout > 0, "ZERO_BALANCE");
            _burn(_msgSender(), tokenId, amount);
            _paymentTokenOf(vf).transfer(_msgSender(), payout);
        } else if (vf._internalState == VirtualFloorInternalState.CancelledUnresolvable
                || vf._internalState == VirtualFloorInternalState.CancelledResolvedNoWinners
                || vf._internalState == VirtualFloorInternalState.CancelledFlagged) {
            uint256 tokenId = ERC1155TokenIds.vfOutcomeTimeslotIdOf(context.virtualFloorId, context.outcomeIndex, context.timeslot);
            uint256 amount = balanceOf(_msgSender(), tokenId);
            require(amount > 0, "ZERO_BALANCE");
            _burn(_msgSender(), tokenId, amount);
            _paymentTokenOf(vf).transfer(_msgSender(), amount);
        } else if (vf._internalState == VirtualFloorInternalState.RunningOrClosed) {
            revert("MARKET_NOT_RESOLVED");
        } else if (vf._internalState == VirtualFloorInternalState.None) {
            revert("MARKET_NOT_FOUND");
        }
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(IERC165Upgradeable, ERC1155Upgradeable, AccessControlUpgradeable)
        virtual // Leave door open for extending contracts to support further interfaces
        returns (bool)
    {
        return ERC1155Upgradeable.supportsInterface(interfaceId) || AccessControlUpgradeable.supportsInterface(interfaceId);
    }


    // ---------- Lifecycle hooks ----------

    function _onVirtualFloorCreation(VirtualFloorCreationParams calldata params) internal virtual {
    }

    function _onVirtualFloorConclusion(uint256 vfId) internal virtual {        
    }


    // ---------- Pausability ----------

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }


    /// @dev See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
    uint256[50] private __gap;
}
