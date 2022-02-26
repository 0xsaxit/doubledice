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
    address creator;             //   20 bytes
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

library Utils {
    function toUint192(uint256 value) internal pure returns (uint192) {
        require(value <= type(uint192).max, "SafeCast: value doesn't fit in 192 bits");
        return uint192(value);
    }
}

contract DoubleDice is
    IDoubleDiceAdmin,
    ERC1155Upgradeable,
    AccessControlUpgradeable
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
    using VirtualFloors for VirtualFloor;


    // ---------- Storage ----------

    address public platformFeeBeneficiary;

    UFixed16x4 internal platformFeeRate;

    mapping(uint256 => VirtualFloor) public _vfs;

    AddressWhitelist internal _paymentTokenWhitelist;


    // ---------- Setup & config ----------

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


    function setTokenMetadataUriTemplate(string calldata template)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        _setURI(template);
    }


    function setPlatformFeeBeneficiary(address platformFeeBeneficiary_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setPlatformFeeBeneficiary(platformFeeBeneficiary_);
    }

    function _setPlatformFeeBeneficiary(address platformFeeBeneficiary_) internal {
        platformFeeBeneficiary = platformFeeBeneficiary_;
        emit PlatformFeeBeneficiaryUpdate(platformFeeBeneficiary_);
    }


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


    function _paymentTokenOf(VirtualFloor storage vf) internal view returns (IERC20Upgradeable) {
        return IERC20Upgradeable(_paymentTokenWhitelist.addressForKey(vf.creationParams.paymentTokenId));
    }

    function updatePaymentTokenWhitelist(IERC20Upgradeable token, bool isWhitelisted) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _paymentTokenWhitelist.setWhitelistStatus(address(token), isWhitelisted);
        emit PaymentTokenWhitelistUpdate(token, isWhitelisted);
    }

    function isPaymentTokenWhitelisted(IERC20Upgradeable token) external view returns (bool) {
        return _paymentTokenWhitelist.isWhitelisted(address(token));
    }


    // ---------- Public getters ----------

    uint256 constant public TIMESLOT_DURATION = 60 seconds;

    function getVirtualFloorState(
        uint256 vfId
    )
        public
        view
        returns (VirtualFloorState)
    {
        return _vfs[vfId].state();
    }

    function getVirtualFloorCreator(uint256 vfId) external view returns (address) {
        VirtualFloor storage vf = _vfs[vfId];
        require(vf.internalState != VirtualFloorInternalState.None, "VIRTUAL_FLOOR_NOT_FOUND");
        return vf.creator;
    }

    function getVirtualFloorParams(uint256 vfId)
        external view returns (VirtualFloorParams memory)
    {
        VirtualFloor storage vf = _vfs[vfId];
        return VirtualFloorParams({
            betaOpen_e18: vf.creationParams.betaOpenMinusBetaClose.toUFixed256x18().add(_BETA_CLOSE),
            creationFeeRate_e18: vf.creationParams.creationFeeRate.toUFixed256x18(),
            platformFeeRate_e18: vf.creationParams.platformFeeRate.toUFixed256x18(),
            tOpen: vf.creationParams.tOpen,
            tClose: vf.creationParams.tClose,
            tResolve: vf.creationParams.tResolve,
            nOutcomes: vf.creationParams.nOutcomes,
            paymentToken: _paymentTokenOf(vf),
            creator: vf.creator
        });
    }

    function getVirtualFloorOutcomeTotals(uint256 vfId, uint8 outcomeIndex)
        external view returns (OutcomeTotals memory)
    {
        return _vfs[vfId].outcomeTotals[outcomeIndex];
    }


    // ---------- Virtual-floor lifecycle ----------

    function createVirtualFloor(VirtualFloorCreationParams calldata params) external {

        // ~3000 gas cheaper than using qualified fields param.* throughout.
        // Also slightly cheaper than a multiple field assignment
        // (vfId, ...) = (params.virtualFloorId, ...)
        uint256 vfId = params.virtualFloorId;
        UFixed256x18 betaOpen = params.betaOpen_e18;
        UFixed256x18 creationFeeRate = params.creationFeeRate_e18;
        uint32 tOpen = params.tOpen;
        uint32 tClose = params.tClose;
        uint32 tResolve = params.tResolve;
        uint8 nOutcomes = params.nOutcomes;
        IERC20Upgradeable paymentToken = params.paymentToken;
        VirtualFloorMetadata calldata metadata = params.metadata;

        VirtualFloor storage vf = _vfs[vfId];

        require(vf.internalState == VirtualFloorInternalState.None, "MARKET_DUPLICATE");

        require(betaOpen.gte(_BETA_CLOSE), "Error: betaOpen < 1.0");
        vf.creationParams.betaOpenMinusBetaClose = betaOpen.sub(_BETA_CLOSE).toUFixed32x6();

        require(creationFeeRate.lte(UFIXED256X18_ONE), "Error: creationFeeRate > 1.0");
        vf.creationParams.creationFeeRate = creationFeeRate.toUFixed16x4();

        // freeze platformFeeRate value as it is right now
        vf.creationParams.platformFeeRate = platformFeeRate;

        // Allow creation to happen up to 10% into the Open period,
        // to be a bit tolerant to mining delays.
        require(block.timestamp < tOpen + (tClose - tOpen) / 10, "Error: t >= 10% into open period");

        require(tOpen < tClose, "Error: tOpen >= tClose");
        require(tClose <= tResolve, "Error: tClose > tResolve");

        require(nOutcomes >= 2, "Error: nOutcomes < 2");

        _requireValidMetadata(nOutcomes, metadata);

        require(_paymentTokenWhitelist.isWhitelisted(address(paymentToken)), "Error: Payment token is not whitelisted");
        vf.creationParams.paymentTokenId = toAddressWhitelistKey(address(paymentToken));

        vf.internalState = VirtualFloorInternalState.RunningOrClosed;
        vf.creationParams.tOpen = tOpen;
        vf.creationParams.tClose = tClose;
        vf.creationParams.tResolve = tResolve;
        vf.creationParams.nOutcomes = nOutcomes;

        emit VirtualFloorCreation({
            virtualFloorId: vfId,
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

        require(ERC1155TokenIds.isValidVirtualFloorId(vfId), "INVALID_VIRTUALFLOOR_ID");

        // ToDo: For now we simply set owner field on VF data-structure.
        // Later we might bring back this VF being a NFT, as this would
        // allow ownership transfer, integration with Etherscan, wallets, etc.
        vf.creator = _msgSender();
    }

    function commitToVirtualFloor(uint256 vfId, uint8 outcomeIndex, uint256 amount)
        external
    {
        VirtualFloor storage vf = _vfs[vfId];

        require(vf.state() == VirtualFloorState.Running, "MARKET_NOT_FOUND|MARKET_CLOSED");

        require(outcomeIndex < vf.creationParams.nOutcomes, "OUTCOME_INDEX_OUT_OF_RANGE");

        // Note: By enforcing this requirement, we can later assume that 0 committed value = 0 commitments
        // If we allowed 0-value commitments, it would no longer be possible to make this deduction.
        require(amount > 0, "AMOUNT_ZERO");

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
        timeslot = MathUpgradeable.max(vf.creationParams.tOpen, timeslot);

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
        virtual
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
        external
    {
        VirtualFloor storage vf = _vfs[vfId];
        require(vf.state() == VirtualFloorState.ClosedUnresolvable, "MARKET_INEXISTENT_OR_IN_WRONG_STATE|TOO_EARLY|Error: VF only unresolvable if commitments to less than 2 outcomes");
        vf.internalState = VirtualFloorInternalState.CancelledUnresolvable;
        emit VirtualFloorCancellationUnresolvable(vfId);
    }

    function cancelVirtualFloorFlagged(uint256 vfId, string calldata reason)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        VirtualFloor storage vf = _vfs[vfId];
        require(vf.internalState == VirtualFloorInternalState.RunningOrClosed, "MARKET_INEXISTENT_OR_IN_WRONG_STATE");
        vf.internalState = VirtualFloorInternalState.CancelledFlagged;
        emit VirtualFloorCancellationFlagged(vfId, reason);
    }

    function resolve(uint256 vfId, uint8 winningOutcomeIndex)
        external
    {
        VirtualFloor storage vf = _vfs[vfId];

        require(vf.state() == VirtualFloorState.ClosedResolvable, "MARKET_INEXISTENT_OR_IN_WRONG_STATE|TOO_EARLY_TO_RESOLVE|Error: Cannot resolve VF with commitments to less than 2 outcomes");

        require(_msgSender() == vf.creator, "NOT_VIRTUALFLOOR_OWNER");

        require(winningOutcomeIndex < vf.creationParams.nOutcomes, "OUTCOME_INDEX_OUT_OF_RANGE");

        vf.winningOutcomeIndex = winningOutcomeIndex;

        uint256 totalVirtualFloorCommittedAmount = 0;
        for (uint256 i = 0; i < vf.creationParams.nOutcomes; i++) {
            totalVirtualFloorCommittedAmount += vf.outcomeTotals[i].amount;
        }

        uint256 totalWinnerCommitments = vf.outcomeTotals[winningOutcomeIndex].amount;

        VirtualFloorResolutionType resolutionType;
        uint256 platformFeeAmount;
        uint256 creatorFeeAmount;
        uint256 winnerProfits;

        if (totalWinnerCommitments == 0) {
            // This could happen if e.g. there are commitments to outcome #0 and outcome #1,
            // but not to outcome #2, and #2 is the winner.
            // In this case, the current ERC-1155 commitment-type token owner becomes eligible
            // to reclaim the equivalent original ERC-20 token amount,
            // i.e. to withdraw the current ERC-1155 balance as ERC-20 tokens.
            // Neither the creator nor the platform take any fees in this circumstance.
            vf.internalState = VirtualFloorInternalState.CancelledResolvedNoWinners;
            resolutionType = VirtualFloorResolutionType.CancelledNoWinners;
            platformFeeAmount = 0;
            creatorFeeAmount = 0;
            winnerProfits = 0;
        } else if (totalWinnerCommitments == totalVirtualFloorCommittedAmount) {
            // This used to be handled on this contract as a VirtualFloorResolution of type AllWinners,
            // but it can no longer happen, because if all commitments are to a single outcome,
            // transaction would have already been reverted because of
            // the condition nonzeroOutcomeCount == 1, which is < 2.
            // We retain this assertion as a form of documentation.
            assert(false);
        } else {
            vf.internalState = VirtualFloorInternalState.ResolvedWinners;
            resolutionType = VirtualFloorResolutionType.Winners;

            // Winner commitments refunded, fee taken, then remainder split between winners proportionally by `commitment * beta`.
            uint256 maxCreationFeeAmount = vf.creationParams.creationFeeRate.toUFixed256x18().mul0(totalVirtualFloorCommittedAmount).floorToUint256();

            // If needs be, limit the fee to ensure that there enough funds to be able to refund winner commitments in full.
            uint256 creationFeePlusWinnerProfits = totalVirtualFloorCommittedAmount - totalWinnerCommitments;

            // ToDo: Replace Math.min with `a < b ? a : b` and check gas usage
            uint256 creationFeeAmount = MathUpgradeable.min(maxCreationFeeAmount, creationFeePlusWinnerProfits);

            winnerProfits = creationFeePlusWinnerProfits - creationFeeAmount;
            vf.winnerProfits = winnerProfits.toUint192();

            platformFeeAmount = vf.creationParams.platformFeeRate.toUFixed256x18().mul0(creationFeeAmount).floorToUint256();
            _paymentTokenOf(vf).safeTransfer(platformFeeBeneficiary, platformFeeAmount);

            unchecked {
                creatorFeeAmount = creationFeeAmount - platformFeeAmount;
            }
            // _msgSender() owns the virtual-floor
            _paymentTokenOf(vf).safeTransfer(_msgSender(), creatorFeeAmount);
        }

        emit VirtualFloorResolution({
            virtualFloorId: vfId,
            winningOutcomeIndex: winningOutcomeIndex,
            resolutionType: resolutionType,
            winnerProfits: winnerProfits,
            platformFeeAmount: platformFeeAmount,
            creatorFeeAmount: creatorFeeAmount
        });
    }

    function claim(VirtualFloorOutcomeTimeslot calldata context)
        external
    {
        VirtualFloor storage vf = _vfs[context.virtualFloorId];
        if (vf.internalState == VirtualFloorInternalState.ResolvedWinners) {

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
        } else if (vf.internalState == VirtualFloorInternalState.CancelledUnresolvable
                || vf.internalState == VirtualFloorInternalState.CancelledResolvedNoWinners
                || vf.internalState == VirtualFloorInternalState.CancelledFlagged) {
            uint256 tokenId = ERC1155TokenIds.vfOutcomeTimeslotIdOf(context.virtualFloorId, context.outcomeIndex, context.timeslot);
            uint256 amount = balanceOf(_msgSender(), tokenId);
            require(amount > 0, "ZERO_BALANCE");
            _burn(_msgSender(), tokenId, amount);
            _paymentTokenOf(vf).transfer(_msgSender(), amount);
        } else if (vf.internalState == VirtualFloorInternalState.RunningOrClosed) {
            revert("MARKET_NOT_RESOLVED");
        } else if (vf.internalState == VirtualFloorInternalState.None) {
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

}

library VirtualFloors {

    using FixedPointTypes for UFixed256x18;
    using FixedPointTypes for UFixed32x6;
    using VirtualFloors for VirtualFloor;

    function state(VirtualFloor storage vf) internal view returns (VirtualFloorState) {
        VirtualFloorInternalState internalState = vf.internalState;
        if (internalState == VirtualFloorInternalState.None) {
            return VirtualFloorState.None;
        } else if (internalState == VirtualFloorInternalState.RunningOrClosed) {
            if (block.timestamp < vf.creationParams.tClose) {
                return VirtualFloorState.Running;
            } else {
                if (vf.nonzeroOutcomeCount >= 2) {
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

    /// @dev Compare:
    /// 1. (((tClose - t) * (betaOpen - 1)) / (tClose - tOpen)) * amount
    /// 2. (((tClose - t) * (betaOpen - 1) * amount) / (tClose - tOpen))
    /// (2) has less rounding error than (1), but then the *precise* effective beta used in the computation might not
    /// have a uint256 representation.
    /// Therefore we sacrifice some (miniscule) rounding error to gain computation reproducibility.
    function betaOf(VirtualFloor storage vf, uint256 t) internal view returns (UFixed256x18) {
        UFixed256x18 betaOpenMinusBetaClose = vf.creationParams.betaOpenMinusBetaClose.toUFixed256x18();
        return _BETA_CLOSE.add(betaOpenMinusBetaClose.mul0(vf.creationParams.tClose - t).div0(vf.creationParams.tClose - vf.creationParams.tOpen));
    }

}
