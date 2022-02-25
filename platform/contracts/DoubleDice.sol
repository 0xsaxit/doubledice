// SPDX-License-Identifier: Unlicensed

pragma solidity 0.8.12;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeCastUpgradeable.sol";

import "./AddressWhitelists.sol";
import "./ERC1155TokenIds.sol";
import "./FixedPointTypes.sol";
import "./IDoubleDiceAdmin.sol";

uint256 constant _TIMESLOT_DURATION = 60 seconds;

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

/// @dev These params are extracted into a struct only to work around a Solidity
/// limitation whereby exceeding a certain threshold of struct member variables
/// fails compilation with:
/// "CompilerError: Stack too deep when compiling inline assembly:
/// Variable value0 is 1 slot(s) too deep inside the stack."
/// Once it was necessary to seek this workaround, the selected members were
/// tailored to fit into a single 32-byte slot, and were chosen to be
/// parameters that are set once in VF-creation and never touched again,
/// so that from VF-creation onwards, this storage slot becomes "read-only",
/// thus being gas-efficient.
struct StoredVirtualFloorCreationParams {
    uint8 nOutcomes;                    // +  1 byte
    uint32 tOpen;                       // +  4 bytes
    uint32 tClose;                      // +  4 bytes 
    uint32 tResolve;                    // +  4 bytes
    UFixed32x6 betaOpenMinusBetaClose;  // +  4 bytes ; fits with 6-decimal-place precision all values up to ~4000.000000
    UFixed16x4 creationFeeRate;         // +  2 bytes ; fits with 4-decimal-place precision entire range [0.0000, 1.0000]
    UFixed16x4 platformFeeRate;         // +  2 bytes ; fits with 4-decimal-place precision entire range [0.0000, 1.0000]
    AddressWhitelistKey paymentTokenId; // + 10 bytes
                                        // = 31 bytes => packed into 1 32-byte slot
}

struct VirtualFloor {

    // Storage slot 0: Written to during createVirtualFloor, only read from thereafter
    StoredVirtualFloorCreationParams creationParams;

    // Storage slot 1: Slot written to during createVirtualFloor, and updated throughout VF lifecycle
    address owner;             //   20 bytes
    bytes10 reserved2;         // + 10 bytes
    VirtualFloorInternalState internalState;   // +  1 byte
    uint8 nonzeroOutcomeCount; // +  1 byte  ; number of outcomes having aggregate commitments > 0
                               // = 32 bytes => packed into 1 32-byte slot

    // Storage slot 2: Not written to, but used in calculation of outcome-specific slots
    // Note: A fixed-length array is used to not an entire 32-byte slot to write array-length,
    // but instead store the length in 1 byte in `nOutcomes`
    OutcomeTotals[_MAX_OUTCOMES_PER_VIRTUAL_FLOOR] outcomeTotals;

    // Storage slot 3: Slot written to during resolve
    uint8 winningOutcomeIndex; // +  1 byte
    uint192 winnerProfits;     // + 24 bytes ; fits with 18-decimal-place precision all values up to ~1.5e30 (and with less decimals, more)
                               // = 25 bytes => packed into 1 32-byte slot
}

function _toUint192(uint256 value) pure returns (uint192) {
    require(value <= type(uint192).max, "SafeCast: value doesn't fit in 192 bits");
    return uint192(value);
}

contract DoubleDice is
    IDoubleDiceAdmin,
    ERC1155Upgradeable,
    AccessControlUpgradeable
{
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using SafeCastUpgradeable for uint256;
    using AddressWhitelists for address;
    using AddressWhitelists for AddressWhitelist;
    using FixedPointTypes for uint256;
    using FixedPointTypes for UFixed16x4;
    using FixedPointTypes for UFixed32x6;
    using FixedPointTypes for UFixed256x18;
    
    /// @dev Compare:
    /// 1. (((tClose - t) * (betaOpen - 1)) / (tClose - tOpen)) * amount
    /// 2. (((tClose - t) * (betaOpen - 1) * amount) / (tClose - tOpen))
    /// (2) has less rounding error than (1), but then the *precise* effective beta used in the computation might not
    /// have a uint256 representation.
    /// Therefore we sacrifice some (miniscule) rounding error to gain computation reproducibility.
    function _calcBeta(VirtualFloor storage vf, uint256 t) internal view returns (UFixed256x18 beta_e18) {
        uint256 betaOpenMinusBetaClose_e18 = UFixed256x18.unwrap(vf.creationParams.betaOpenMinusBetaClose.toUFixed256x18());
        uint256 betaClose_e18 = UFixed256x18.unwrap(_BETA_CLOSE);
        beta_e18 = UFixed256x18.wrap(betaClose_e18 + ((vf.creationParams.tClose - t) * betaOpenMinusBetaClose_e18) / (uint256(vf.creationParams.tClose) - uint256(vf.creationParams.tOpen)));
    }


    function setTokenMetadataUriTemplate(string calldata template)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        _setURI(template);
    }


    address public platformFeeBeneficiary;

    function setPlatformFeeBeneficiary(address platformFeeBeneficiary_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setPlatformFeeBeneficiary(platformFeeBeneficiary_);
    }

    function _setPlatformFeeBeneficiary(address platformFeeBeneficiary_) internal {
        platformFeeBeneficiary = platformFeeBeneficiary_;
        emit PlatformFeeBeneficiaryUpdate(platformFeeBeneficiary_);
    }


    UFixed16x4 internal platformFeeRate;

    /// @notice The current platform-fee rate as a proportion of the creator-fee taken
    /// on virtualfloor resolution.
    /// E.g. 1.25% would be returned as 0.0125e18
    function platformFeeRate_e18() external view returns (UFixed256x18) {
        return platformFeeRate.toUFixed256x18();
    }

    function setPlatformFeeRate_e18(UFixed256x18 platformFeeRate_e18_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setPlatformFeeRate_e18(platformFeeRate_e18_);
    }

    function _setPlatformFeeRate_e18(UFixed256x18 platformFeeRate_e18_) internal {
        require(platformFeeRate_e18_.lte(UFIXED256X18_ONE), "Error: platformFeeRate > 1.0");
        platformFeeRate = platformFeeRate_e18_.toUFixed16x4();
        emit PlatformFeeRateUpdate(platformFeeRate_e18_);
    }

    function initialize(
        string memory tokenMetadataUriTemplate,
        UFixed256x18 platformFeeRate_e18_,
        address platformFeeBeneficiary_
    ) external initializer {
        __ERC1155_init(tokenMetadataUriTemplate);
        __AccessControl_init();
        _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());
        _setPlatformFeeRate_e18(platformFeeRate_e18_);
        _setPlatformFeeBeneficiary(platformFeeBeneficiary_);
    }

    mapping(uint256 => VirtualFloor) public _virtualFloors;


    AddressWhitelist internal _paymentTokenWhitelist;

    function _paymentTokenOf(VirtualFloor storage virtualFloor) internal view returns (IERC20Upgradeable) {
        return IERC20Upgradeable(_paymentTokenWhitelist.addressForKey(virtualFloor.creationParams.paymentTokenId));
    }

    function updatePaymentTokenWhitelist(IERC20Upgradeable token, bool isWhitelisted) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _paymentTokenWhitelist.setWhitelistStatus(address(token), isWhitelisted);
        emit PaymentTokenWhitelistUpdate(token, isWhitelisted);
    }

    function isPaymentTokenWhitelisted(IERC20Upgradeable token) external view returns (bool) {
        return _paymentTokenWhitelist.isWhitelisted(address(token));
    }


    function createVirtualFloor(VirtualFloorCreationParams calldata params) external {

        // ~3000 gas cheaper than using qualified fields param.* throughout.
        // Also slightly cheaper than a multiple field assignment
        // (virtualFloorId, ...) = (params.virtualFloorId, ...)
        uint256 virtualFloorId = params.virtualFloorId;
        UFixed256x18 betaOpen = params.betaOpen_e18;
        UFixed256x18 creationFeeRate = params.creationFeeRate_e18;
        uint32 tOpen = params.tOpen;
        uint32 tClose = params.tClose;
        uint32 tResolve = params.tResolve;
        uint8 nOutcomes = params.nOutcomes;
        IERC20Upgradeable paymentToken = params.paymentToken;
        VirtualFloorMetadata calldata metadata = params.metadata;

        VirtualFloor storage virtualFloor = _virtualFloors[virtualFloorId];

        require(virtualFloor.internalState == VirtualFloorInternalState.None, "MARKET_DUPLICATE");

        require(betaOpen.gte(_BETA_CLOSE), "Error: betaOpen < 1.0");
        virtualFloor.creationParams.betaOpenMinusBetaClose = betaOpen.sub(_BETA_CLOSE).toUFixed32x6();

        require(creationFeeRate.lte(UFIXED256X18_ONE), "Error: creationFeeRate > 1.0");
        virtualFloor.creationParams.creationFeeRate = creationFeeRate.toUFixed16x4();

        // freeze platformFeeRate value as it is right now
        virtualFloor.creationParams.platformFeeRate = platformFeeRate;

        // Require all timestamps to be exact multiples of the timeslot-duration.
        // This makes everything simpler to reason about.
        require(tOpen % _TIMESLOT_DURATION == 0, "Error: tOpen % _TIMESLOT_DURATION != 0");
        require(tClose % _TIMESLOT_DURATION == 0, "Error: tClose % _TIMESLOT_DURATION != 0");
        require(tResolve % _TIMESLOT_DURATION == 0, "Error: tResolve % _TIMESLOT_DURATION != 0");

        // Allow creation to happen up to 10% into the Open period,
        // to be a bit tolerant to mining delays.
        require(block.timestamp < tOpen + (tClose - tOpen) / 10, "Error: t >= 10% into open period");

        require(tOpen < tClose, "Error: tOpen >= tClose");
        require(tClose <= tResolve, "Error: tClose > tResolve");

        require(nOutcomes >= 2, "Error: nOutcomes < 2");

        _requireValidMetadata(nOutcomes, metadata);

        require(_paymentTokenWhitelist.isWhitelisted(address(paymentToken)), "Error: Payment token is not whitelisted");
        virtualFloor.creationParams.paymentTokenId = toAddressWhitelistKey(address(paymentToken));

        virtualFloor.internalState = VirtualFloorInternalState.RunningOrClosed;
        virtualFloor.creationParams.tOpen = tOpen;
        virtualFloor.creationParams.tClose = tClose;
        virtualFloor.creationParams.tResolve = tResolve;
        virtualFloor.creationParams.nOutcomes = nOutcomes;

        emit VirtualFloorCreation({
            virtualFloorId: virtualFloorId,
            creator: _msgSender(),
            betaOpen_e18: betaOpen,
            creationFeeRate_e18: creationFeeRate,
            platformFeeRate_e18: platformFeeRate.toUFixed256x18(),
            tOpen: tOpen,
            tClose: tClose,
            tResolve: tResolve,
            nOutcomes: nOutcomes,
            paymentToken: paymentToken,
            metadata: metadata
        });

        require(ERC1155TokenIds.isValidVirtualFloorId(virtualFloorId), "INVALID_VIRTUALFLOOR_ID");

        // ToDo: For now we simply set owner field on VF data-structure.
        // Later we might bring back this VF being a NFT, as this would
        // allow ownership transfer, integration with Etherscan, wallets, etc.
        virtualFloor.owner = _msgSender();
    }

    function commitToVirtualFloor(uint256 virtualFloorId, uint8 outcomeIndex, uint256 amount)
        external
    {
        VirtualFloor storage virtualFloor = _virtualFloors[virtualFloorId];
        require(virtualFloor.internalState == VirtualFloorInternalState.RunningOrClosed, "MARKET_NOT_FOUND");

        require(block.timestamp < virtualFloor.creationParams.tClose, "MARKET_CLOSED");
        require(outcomeIndex < virtualFloor.creationParams.nOutcomes, "OUTCOME_INDEX_OUT_OF_RANGE");

        // Note: By enforcing this requirement, we can later assume that 0 committed value = 0 commitments
        // If we allowed 0-value commitments, it would no longer be possible to make this deduction.
        require(amount > 0, "AMOUNT_ZERO");

        _paymentTokenOf(virtualFloor).safeTransferFrom(_msgSender(), address(this), amount);

        // Assign all commitments that happen within the same `_TIMESLOT_DURATION`, to the same "timeslot."
        // These commitments will all be assigned the same associated beta value.
        // If `_TIMESLOT_DURATION` is set to 1 minute, then the following line converts
        // all 2022-01-11T15:47:XX to 2022-01-11T15:47:00,
        // and this rounded-down timestamp is used as the "timeslot identifier".
        uint256 timeslot = block.timestamp - (block.timestamp % _TIMESLOT_DURATION);

        // Commitments made at t < tOpen will all be accumulated into the same timeslot == tOpen,
        // and will therefore be assigned the same beta == betaOpen.
        // This means that all commitments to a specific outcome that happen at t <= tOpen
        // (actually up to t < tOpen + _TIMESLOT_DURATION)
        // will be minted as balances on the the same ERC-1155 tokenId, which means that
        // these balances will be exchangeable/tradeable/fungible between themselves,
        // but they will not be fungible with commitments to the same outcome that arrive later.
        timeslot = MathUpgradeable.max(virtualFloor.creationParams.tOpen, timeslot);

        UFixed256x18 beta_e18 = _calcBeta(virtualFloor, timeslot);
        OutcomeTotals storage outcomeTotals = virtualFloor.outcomeTotals[outcomeIndex];

        // Only increment this counter the first time an outcome is committed to.
        // In this way, this counter will be updated maximum nOutcome times over the entire commitment period.
        // Some gas could be saved here by marking as unchecked, and by not counting beyond 2,
        // but we choose to forfeit these micro-optimizations to retain simplicity.
        if (outcomeTotals.amount == 0) {
            virtualFloor.nonzeroOutcomeCount += 1;
        }

        outcomeTotals.amount += amount;
        outcomeTotals.amountTimesBeta_e18 = outcomeTotals.amountTimesBeta_e18.add(beta_e18.mul0(amount));

        uint256 tokenId = ERC1155TokenIds.vfOutcomeTimeslotIdOf(virtualFloorId, outcomeIndex, timeslot);

        // From the Graph's point of view...
        // First we declare the parameters bound to a particular tokenId...
        emit UserCommitment({
            virtualFloorId: virtualFloorId,
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
        virtual
    {
        super._beforeTokenTransfer(operator, from, to, ids, amounts, data);

        // No restrictions on mint/burn
        if (from == address(0) || to == address(0)) {
            return;
        }

        for (uint256 i = 0; i < ids.length; i++) {
            uint256 id = ids[i];
            // Only restrict commitment-type ERC-1155 token transfers
            if (ERC1155TokenIds.isTypeCommitmentBalance(id)) {
                uint256 virtualFloorId = ERC1155TokenIds.extractVirtualFloorId(id);
                VirtualFloor storage virtualFloor = _virtualFloors[virtualFloorId];

                // ToDo: Does combining these requires into 1 require result in significant gas decrease?
                if(!(virtualFloor.internalState == VirtualFloorInternalState.RunningOrClosed)) {
                    revert CommitmentBalanceTransferRejection(id, CommitmentBalanceTransferRejectionCause.WrongState);
                }
                if(!(block.timestamp < virtualFloor.creationParams.tResolve)) {
                    revert CommitmentBalanceTransferRejection(id, CommitmentBalanceTransferRejectionCause.TooLate);
                }
                if(!_hasCommitmentsToEnoughOutcomes(virtualFloor)) {
                    revert CommitmentBalanceTransferRejection(id, CommitmentBalanceTransferRejectionCause.VirtualFloorUnresolvable);
                }
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
    function cancelVirtualFloorUnresolvable(uint256 virtualFloorId)
        external
    {
        VirtualFloor storage virtualFloor = _virtualFloors[virtualFloorId];
        require(virtualFloor.internalState == VirtualFloorInternalState.RunningOrClosed, "MARKET_INEXISTENT_OR_IN_WRONG_STATE");
        require(block.timestamp >= virtualFloor.creationParams.tClose, "TOO_EARLY");
        require(!_hasCommitmentsToEnoughOutcomes(virtualFloor), "Error: VF only unresolvable if commitments to less than 2 outcomes");
        virtualFloor.internalState = VirtualFloorInternalState.CancelledUnresolvable;
        emit VirtualFloorCancellationUnresolvable(virtualFloorId);
    }

    function cancelVirtualFloorFlagged(uint256 virtualFloorId, string calldata reason)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        VirtualFloor storage virtualFloor = _virtualFloors[virtualFloorId];
        require(virtualFloor.internalState == VirtualFloorInternalState.RunningOrClosed, "MARKET_INEXISTENT_OR_IN_WRONG_STATE");
        virtualFloor.internalState = VirtualFloorInternalState.CancelledFlagged;
        emit VirtualFloorCancellationFlagged(virtualFloorId, reason);
    }

    function resolve(uint256 virtualFloorId, uint8 winningOutcomeIndex)
        external
    {
        VirtualFloor storage virtualFloor = _virtualFloors[virtualFloorId];
        require(virtualFloor.internalState == VirtualFloorInternalState.RunningOrClosed, "MARKET_INEXISTENT_OR_IN_WRONG_STATE");

        // We do this check inline instead of using a special `onlyVirtualFloorOwner` modifier, so that
        // (1) we do not break the pattern by which we always check state first
        // (2) we avoid "hiding away" code in modifiers
        require(_msgSender() == virtualFloor.owner, "NOT_VIRTUALFLOOR_OWNER");

        require(_hasCommitmentsToEnoughOutcomes(virtualFloor), "Error: Cannot resolve VF with commitments to less than 2 outcomes");

        require(block.timestamp >= virtualFloor.creationParams.tResolve, "TOO_EARLY_TO_RESOLVE");
        require(winningOutcomeIndex < virtualFloor.creationParams.nOutcomes, "OUTCOME_INDEX_OUT_OF_RANGE");

        virtualFloor.winningOutcomeIndex = winningOutcomeIndex;

        uint256 totalVirtualFloorCommittedAmount = 0;
        for (uint256 i = 0; i < virtualFloor.creationParams.nOutcomes; i++) {
            totalVirtualFloorCommittedAmount += virtualFloor.outcomeTotals[i].amount;
        }

        uint256 totalWinnerCommitments = virtualFloor.outcomeTotals[winningOutcomeIndex].amount;

        VirtualFloorResolutionType resolutionType;
        uint256 platformFeeAmount;
        uint256 ownerFeeAmount;
        uint256 winnerProfits;

        if (totalWinnerCommitments == 0) {
            // This could happen if e.g. there are commitments to outcome #0 and outcome #1,
            // but not to outcome #2, and #2 is the winner.
            // In this case, the current ERC-1155 commitment-type token owner becomes eligible
            // to reclaim the equivalent original ERC-20 token amount,
            // i.e. to withdraw the current ERC-1155 balance as ERC-20 tokens.
            // Neither the creator nor the platform take any fees in this circumstance.
            virtualFloor.internalState = VirtualFloorInternalState.CancelledResolvedNoWinners;
            resolutionType = VirtualFloorResolutionType.CancelledNoWinners;
            platformFeeAmount = 0;
            ownerFeeAmount = 0;
            winnerProfits = 0;
        } else if (totalWinnerCommitments == totalVirtualFloorCommittedAmount) {
            // This used to be handled on this contract as a VirtualFloorResolution of type AllWinners,
            // but it can no longer happen, because if all commitments are to a single outcome,
            // transaction would have already been reverted because of
            // the condition nonzeroOutcomeCount == 1, which is < 2.
            // We retain this assertion as a form of documentation.
            assert(false);
        } else {
            virtualFloor.internalState = VirtualFloorInternalState.ResolvedWinners;
            resolutionType = VirtualFloorResolutionType.Winners;

            // Winner commitments refunded, fee taken, then remainder split between winners proportionally by `commitment * beta`.
            uint256 maxCreationFeeAmount = virtualFloor.creationParams.creationFeeRate.toUFixed256x18().mul0(totalVirtualFloorCommittedAmount).floorToUint256();

            // If needs be, limit the fee to ensure that there enough funds to be able to refund winner commitments in full.
            uint256 creationFeePlusWinnerProfits = totalVirtualFloorCommittedAmount - totalWinnerCommitments;

            // ToDo: Replace Math.min with `a < b ? a : b` and check gas usage
            uint256 creationFeeAmount = MathUpgradeable.min(maxCreationFeeAmount, creationFeePlusWinnerProfits);

            winnerProfits = creationFeePlusWinnerProfits - creationFeeAmount;
            virtualFloor.winnerProfits = _toUint192(winnerProfits);

            platformFeeAmount = virtualFloor.creationParams.platformFeeRate.toUFixed256x18().mul0(creationFeeAmount).floorToUint256();
            _paymentTokenOf(virtualFloor).safeTransfer(platformFeeBeneficiary, platformFeeAmount);

            unchecked {
                ownerFeeAmount = creationFeeAmount - platformFeeAmount;
            }
            // _msgSender() owns the virtual-floor
            _paymentTokenOf(virtualFloor).safeTransfer(_msgSender(), ownerFeeAmount);
        }

        emit VirtualFloorResolution({
            virtualFloorId: virtualFloorId,
            winningOutcomeIndex: winningOutcomeIndex,
            resolutionType: resolutionType,
            winnerProfits: winnerProfits,
            platformFeeAmount: platformFeeAmount,
            ownerFeeAmount: ownerFeeAmount
        });
    }

    function claim(VirtualFloorOutcomeTimeslot calldata context)
        external
    {
        VirtualFloor storage virtualFloor = _virtualFloors[context.virtualFloorId];
        if (virtualFloor.internalState == VirtualFloorInternalState.ResolvedWinners) {

            // ToDo: Because of this requirement, losing tokens can never be burnt... would we like to burn them? 
            require(context.outcomeIndex == virtualFloor.winningOutcomeIndex, "NOT_WINNING_OUTCOME");

            uint256 tokenId = ERC1155TokenIds.vfOutcomeTimeslotIdOf(context.virtualFloorId, context.outcomeIndex, context.timeslot);
            uint256 amount = balanceOf(_msgSender(), tokenId);
            UFixed256x18 beta = _calcBeta(virtualFloor, context.timeslot);
            UFixed256x18 amountTimesBeta = beta.mul0(amount);
            UFixed256x18 aggregateAmountTimesBeta = virtualFloor.outcomeTotals[virtualFloor.winningOutcomeIndex].amountTimesBeta_e18;
            uint256 profit = amountTimesBeta.mul0(virtualFloor.winnerProfits).divToUint256(aggregateAmountTimesBeta);
            uint256 payout = amount + profit;
            require(payout > 0, "ZERO_BALANCE");
            _burn(_msgSender(), tokenId, amount);
            _paymentTokenOf(virtualFloor).transfer(_msgSender(), payout);
        } else if (virtualFloor.internalState == VirtualFloorInternalState.CancelledUnresolvable
                || virtualFloor.internalState == VirtualFloorInternalState.CancelledResolvedNoWinners
                || virtualFloor.internalState == VirtualFloorInternalState.CancelledFlagged) {
            uint256 tokenId = ERC1155TokenIds.vfOutcomeTimeslotIdOf(context.virtualFloorId, context.outcomeIndex, context.timeslot);
            uint256 amount = balanceOf(_msgSender(), tokenId);
            require(amount > 0, "ZERO_BALANCE");
            _burn(_msgSender(), tokenId, amount);
            _paymentTokenOf(virtualFloor).transfer(_msgSender(), amount);
        } else if (virtualFloor.internalState == VirtualFloorInternalState.RunningOrClosed) {
            revert("MARKET_NOT_RESOLVED");
        } else if (virtualFloor.internalState == VirtualFloorInternalState.None) {
            revert("MARKET_NOT_FOUND");
        }
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(IERC165Upgradeable, ERC1155Upgradeable, AccessControlUpgradeable)
        returns (bool)
    {
        return ERC1155Upgradeable.supportsInterface(interfaceId) || AccessControlUpgradeable.supportsInterface(interfaceId);
    }

    // ***** INFORMATIONAL *****

    function getVirtualFloorOwner(uint256 virtualFloorId) external view returns (address) {
        VirtualFloor storage virtualFloor = _virtualFloors[virtualFloorId];
        require(virtualFloor.internalState != VirtualFloorInternalState.None, "VIRTUAL_FLOOR_NOT_FOUND");
        return virtualFloor.owner;
    }

    // If less than 2 outcomes have commitments, then this VF is unresolvable,
    // and resolution is aborted. Instead the VF should be cancelled.
    function _hasCommitmentsToEnoughOutcomes(VirtualFloor storage virtualFloor) internal view returns (bool) {
        return virtualFloor.nonzeroOutcomeCount >= 2;
    }

    function getVirtualFloorOutcomeTotals(uint256 virtualFloorId, uint8 outcomeIndex)
        external view returns (OutcomeTotals memory)
    {
        return _virtualFloors[virtualFloorId].outcomeTotals[outcomeIndex];
    }

    function TIMESLOT_DURATION() external pure returns (uint256) {
        return _TIMESLOT_DURATION;
    }

    function getVirtualFloorParams(uint256 virtualFloorId)
        external view returns (VirtualFloorParams memory)
    {
        VirtualFloor storage vf = _virtualFloors[virtualFloorId];
        return VirtualFloorParams({
            betaOpen_e18: vf.creationParams.betaOpenMinusBetaClose.toUFixed256x18().add(_BETA_CLOSE),
            creationFeeRate_e18: vf.creationParams.creationFeeRate.toUFixed256x18(),
            platformFeeRate_e18: vf.creationParams.platformFeeRate.toUFixed256x18(),
            tOpen: vf.creationParams.tOpen,
            tClose: vf.creationParams.tClose,
            tResolve: vf.creationParams.tResolve,
            nOutcomes: vf.creationParams.nOutcomes,
            paymentToken: _paymentTokenOf(vf),
            owner: vf.owner
        });
    }

    function getVirtualFloorState(
        uint256 virtualFloorId
    )
        public
        view
        returns (VirtualFloorState)
    {
        VirtualFloor storage vf = _virtualFloors[virtualFloorId];
        VirtualFloorInternalState internalState = vf.internalState;
        if (internalState == VirtualFloorInternalState.None) {
            return VirtualFloorState.None;
        } else if (internalState == VirtualFloorInternalState.RunningOrClosed) {
            if (block.timestamp < vf.creationParams.tClose) {
                return VirtualFloorState.Running;
            } else {
                if (_hasCommitmentsToEnoughOutcomes(vf)) {
                    if (block.timestamp < vf.creationParams.tResolve) {
                        return VirtualFloorState.ClosedPreResolvable;
                    } else {
                        return VirtualFloorState.ClosedResolvable;
                    }
                } else {
                    return VirtualFloorState.ClosedUnresolvable;
                }
            }
        } else if (internalState == VirtualFloorInternalState.ResolvedWinners) {
            return VirtualFloorState.ResolvedWinners;
        } else if (internalState == VirtualFloorInternalState.CancelledUnresolvable) {
            return VirtualFloorState.CancelledResolvedNoWinners;
        } else if (internalState == VirtualFloorInternalState.CancelledResolvedNoWinners) {
            return VirtualFloorState.CancelledUnresolvable;
        } else /* if (internalState == VirtualFloorInternalState.CancelledFlagged) */ {
            return VirtualFloorState.CancelledFlagged;
        }
    }

}
