// SPDX-License-Identifier: Unlicensed

pragma solidity 0.8.11;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";

import "./ERC1155TokenIds.sol";
import "./IDoubleDice.sol";
import "./PaymentTokenRegistry.sol";

uint256 constant _TIMESLOT_DURATION = 60 seconds;

uint256 constant _MAX_OUTCOMES_PER_VIRTUAL_FLOOR = 256;

uint256 constant _BETA_CLOSE_E18 = 1e18;

// ToDo: Can we optimize this by using uint128 and packing both values into 1 slot,
// or will amountTimesBeta_e18 then not have enough precision?
struct AggregateCommitment {
    uint256 amount;
    uint256 amountTimesBeta_e18;
}

enum VirtualFloorState {
    None,

    /// @dev Running if t < tClose else Closed
    /// Running means that the VirtualFloor is accepting commitments
    /// Closed means that the VirtualFloor is no longer accepting commitments,
    /// but the associated event has not yet been resolved.
    RunningOrClosed,

    Completed,

    Cancelled
}

struct VirtualFloor {

    // Storage slot 0: Slot written to during createVirtualFloor
    VirtualFloorState state;          //    1 byte
    uint8 nOutcomes;                  // +  1 byte
    uint32 tOpen;                     // +  4 bytes
    uint32 tClose;                    // +  4 bytes 
    uint32 tResolve;                  // +  4 bytes
    uint32 betaOpenMinusBetaClose_e6; // +  4 bytes ; fits with 6-decimal-place precision all values up to ~4000
    uint16 creationFeeRate_e4;        // +  2 bytes ; fits with 4-decimal-place precision entire range [0.0000, 1.0000]
    uint16 platformFeeRate_e4;        // +  2 bytes ; fits with 4-decimal-place precision entire range [0.0000, 1.0000]
    bytes10 paymentTokenId;           // + 10 bytes
                                      // = 32 bytes => packed into 1 32-byte slot

    // Storage slot 1: Slot written to during resolve
    uint8 winningOutcomeIndex; // +  1 byte
    uint192 winnerProfits;     // + 24 bytes ; fits with 18-decimal-place precision all values up to ~1.5e30 (and with less decimals, more)
                               // = 25 bytes => packed into 1 32-byte slot

    // By using a fixed-length array, we do not waste gas to write array-length,
    // as array-length is instead stored in `nOutcomes` which is packed into 1 byte
    // and packed efficiently in slot 0
    AggregateCommitment[_MAX_OUTCOMES_PER_VIRTUAL_FLOOR] aggregateCommitments;
}

/// @dev Compare:
/// 1. (((tClose - t) * (betaOpen - 1)) / (tClose - tOpen)) * amount
/// 2. (((tClose - t) * (betaOpen - 1) * amount) / (tClose - tOpen))
/// (2) has less rounding error than (1), but then the *precise* effective beta used in the computation might not
/// have a uint256 representation.
/// Therefore we sacrifice some (miniscule) rounding error to gain computation reproducibility.
function _calcBeta(VirtualFloor storage vf, uint256 t) view returns (uint256 beta_e18) {
    beta_e18 = _BETA_CLOSE_E18 + ((vf.tClose - t) * vf.betaOpenMinusBetaClose_e6 * 1e12) / (uint256(vf.tClose) - uint256(vf.tOpen));
}

function _toUint192(uint256 value) pure returns (uint192) {
    require(value <= type(uint192).max, "SafeCast: value doesn't fit in 192 bits");
    return uint192(value);
}

contract DoubleDice is
    IDoubleDice,
    ERC1155,
    AccessControl,
    PaymentTokenRegistry
{
    using SafeERC20 for IERC20;
    using SafeCast for uint256;

    function _isMsgSenderVirtualFloorOwner(uint256 virtualFloorId) private view returns (bool) {
        return balanceOf(_msgSender(), virtualFloorId) == 1;
    }

    // ToDo: Setter
    address public platformFeeBeneficiary;

    uint16 internal platformFeeRate_e4;

    /// @notice The current platform-fee rate as a proportion of the creator-fee taken
    /// on virtualfloor resolution.
    /// E.g. 1.25% would be returned as 0.0125e18
    function platformFeeRate_e18() external view returns (uint256) {
        return uint256(platformFeeRate_e4) * 1e14;
    }

    /// @dev Some extra effort has be placed into maintaining an external
    /// 18-decimal-place interface for fixed-point values,
    /// irrespective of their stored representation.
    /// This might be dropped in favour of less code and checks.
    function setPlatformFeeRate_e18(uint256 platformFeeRate_e18_)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(platformFeeRate_e18_ <= 1e18, "Error: platformFeeRate > 1.0");
        platformFeeRate_e4 = (platformFeeRate_e18_ / 1e14).toUint16();
        require(
            uint256(platformFeeRate_e4) * 1e14 == platformFeeRate_e18_,
            "Error: Original platformFeeRate_e18 unrecoverable from stored representation"
        );
        emit PlatformFeeRateUpdate(platformFeeRate_e18_);
    }

    constructor(string memory uri_, address platformFeeBeneficiary_)
        ERC1155(uri_) // ToDo: Override uri() to avoid SLOADs
    {
        _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());
        platformFeeBeneficiary = platformFeeBeneficiary_;
    }

    mapping(uint256 => VirtualFloor) public _virtualFloors;

    function createVirtualFloor(VirtualFloorCreationParams calldata params) external {

        // ~3000 gas cheaper than using qualified fields param.* throughout.
        // Also slightly cheaper than a multiple field assignment
        // (virtualFloorId, ...) = (params.virtualFloorId, ...)
        uint256 virtualFloorId = params.virtualFloorId;
        uint256 betaOpen_e18 = params.betaOpen_e18;
        uint256 creationFeeRate_e18 = params.creationFeeRate_e18;
        uint32 tOpen = params.tOpen;
        uint32 tClose = params.tClose;
        uint32 tResolve = params.tResolve;
        uint8 nOutcomes = params.nOutcomes;
        IERC20 paymentToken = params.paymentToken;
        VirtualFloorMetadata calldata metadata = params.metadata;

        VirtualFloor storage virtualFloor = _virtualFloors[virtualFloorId];
        require(virtualFloor.state == VirtualFloorState.None, "MARKET_DUPLICATE");

        require(betaOpen_e18 >= _BETA_CLOSE_E18, "Error: betaOpen < 1.0");
        _storeBetaOpenEfficiently(virtualFloor, betaOpen_e18);

        require(creationFeeRate_e18 <= 1e18, "Error: creationFeeRate > 1.0");
        _storeCreationFeeRateEfficiently(virtualFloor, creationFeeRate_e18);

        // freeze platformFeeRate value as it is right now
        virtualFloor.platformFeeRate_e4 = platformFeeRate_e4;

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

        require(isPaymentTokenWhitelisted(paymentToken), "Error: Payment token is not whitelisted");

        virtualFloor.state = VirtualFloorState.RunningOrClosed;
        virtualFloor.paymentTokenId = _paymentTokenToId(paymentToken);
        virtualFloor.tOpen = tOpen;
        virtualFloor.tClose = tClose;
        virtualFloor.tResolve = tResolve;
        virtualFloor.nOutcomes = nOutcomes;

        virtualFloor.state = VirtualFloorState.RunningOrClosed;

        emit VirtualFloorCreation({
            virtualFloorId: virtualFloorId,
            creator: _msgSender(),
            betaOpen_e18: betaOpen_e18,
            creationFeeRate_e18: creationFeeRate_e18,
            platformFeeRate_e18: uint256(platformFeeRate_e4) * 1e14,
            tOpen: tOpen,
            tClose: tClose,
            tResolve: tResolve,
            nOutcomes: nOutcomes,
            paymentToken: paymentToken,
            metadata: metadata
        });

        require(ERC1155TokenIds.isValidVirtualFloorId(virtualFloorId), "INVALID_VIRTUALFLOOR_ID");

        // Represent this virtual-floor as an ERC-1155 *non-fungible* token.
        _mint({
            to: _msgSender(),
            id: virtualFloorId,
            amount: 1,
            data: hex""
        });
    }

    function _storeBetaOpenEfficiently(VirtualFloor storage virtualFloor, uint256 betaOpen_e18) internal {
        // Note: We already know that betaOpen >= 1.0

        // Externally we pass betaOpen_e18, and we also emit this value on the VirtualFloorCreated event.
        // Internally we reduce this to 6 decimal places to achieve an gas-efficient on-chain storage layout.
        virtualFloor.betaOpenMinusBetaClose_e6 = ((betaOpen_e18 - _BETA_CLOSE_E18) / 1e12).toUint32();

        // Ensure that we are able to recover the original betaOpen_e18 from betaOpen_e6,
        // i.e. the original `betaOpen_e18` must be of the form #.######_000000_000000
        require(
            _BETA_CLOSE_E18 + (uint256(virtualFloor.betaOpenMinusBetaClose_e6) * 1e12) == betaOpen_e18,
            "Error: Original betaOpen_e18 unrecoverable from stored representation"
        );
    }

    function _storeCreationFeeRateEfficiently(VirtualFloor storage virtualFloor, uint256 creationFeeRate_e18) internal {
        // Note: We already know that creationFeeRate <= 1.0

        virtualFloor.creationFeeRate_e4 = (creationFeeRate_e18 / 1e14).toUint16();
        require(
            uint256(virtualFloor.creationFeeRate_e4) * 1e14 == creationFeeRate_e18,
            "Error: Original creationFeeRate_e18 unrecoverable from stored representation"
        );
    }

    function commitToVirtualFloor(uint256 virtualFloorId, uint8 outcomeIndex, uint256 amount)
        external
    {
        VirtualFloor storage virtualFloor = _virtualFloors[virtualFloorId];
        require(virtualFloor.state == VirtualFloorState.RunningOrClosed, "MARKET_NOT_FOUND");

        require(block.timestamp < virtualFloor.tClose, "MARKET_CLOSED");
        require(outcomeIndex < virtualFloor.nOutcomes, "OUTCOME_INDEX_OUT_OF_RANGE");

        // Note: By enforcing this requirement, we can later assume that 0 committed value = 0 commitments
        // If we allowed 0-value commitments, it would no longer be possible to make this deduction.
        require(amount > 0, "AMOUNT_ZERO");

        _idToPaymentToken(virtualFloor.paymentTokenId).safeTransferFrom(_msgSender(), address(this), amount);

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
        timeslot = Math.max(virtualFloor.tOpen, timeslot);

        uint256 beta_e18 = _calcBeta(virtualFloor, timeslot);
        AggregateCommitment storage aggregateCommitments = virtualFloor.aggregateCommitments[outcomeIndex];
        aggregateCommitments.amount += amount;
        aggregateCommitments.amountTimesBeta_e18 += amount * beta_e18;
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
                require(
                    virtualFloor.state == VirtualFloorState.RunningOrClosed
                    &&
                    virtualFloor.tClose <= block.timestamp && block.timestamp < virtualFloor.tResolve,
                    "Error: Cannot transfer commitment balance"
                );
            }
        }
    }

    function resolve(uint256 virtualFloorId, uint8 winningOutcomeIndex)
        external
    {
        VirtualFloor storage virtualFloor = _virtualFloors[virtualFloorId];
        require(virtualFloor.state == VirtualFloorState.RunningOrClosed, "MARKET_INEXISTENT_OR_IN_WRONG_STATE");

        // We do this check inline instead of using a special `onlyVirtualFloorOwner` modifier, so that
        // (1) we do not break the pattern by which we always check state first
        // (2) we avoid "hiding away" code in modifiers
        require(_isMsgSenderVirtualFloorOwner(virtualFloorId), "NOT_VIRTUALFLOOR_OWNER");

        require(block.timestamp >= virtualFloor.tResolve, "TOO_EARLY_TO_RESOLVE");
        require(winningOutcomeIndex < virtualFloor.nOutcomes, "OUTCOME_INDEX_OUT_OF_RANGE");

        virtualFloor.winningOutcomeIndex = winningOutcomeIndex;

        uint256 totalVirtualFloorCommittedAmount = 0;
        for (uint256 i = 0; i < virtualFloor.nOutcomes; i++) {
            totalVirtualFloorCommittedAmount += virtualFloor.aggregateCommitments[i].amount;
        }

        uint256 totalWinnerCommitments = virtualFloor.aggregateCommitments[winningOutcomeIndex].amount;

        VirtualFloorResolutionType resolutionType;
        uint256 platformFeeAmount;
        uint256 ownerFeeAmount;
        uint256 winnerProfits;

        if (totalWinnerCommitments == 0) {
            // All trade commitments fully refunded, no fee taken.
            virtualFloor.state = VirtualFloorState.Cancelled;
            resolutionType = VirtualFloorResolutionType.NoWinners;
            platformFeeAmount = 0;
            ownerFeeAmount = 0;
            winnerProfits = 0;
        } else if (totalWinnerCommitments == totalVirtualFloorCommittedAmount) {
            // All trade commitments fully refunded, no fee taken.
            virtualFloor.state = VirtualFloorState.Cancelled;
            resolutionType = VirtualFloorResolutionType.AllWinners;
            platformFeeAmount = 0;
            ownerFeeAmount = 0;
            winnerProfits = 0;
        } else {
            virtualFloor.state = VirtualFloorState.Completed;
            resolutionType = VirtualFloorResolutionType.SomeWinners;

            // Winner commitments refunded, fee taken, then remainder split between winners proportionally by `commitment * beta`.
            uint256 maxCreationFeeAmount = (totalVirtualFloorCommittedAmount * virtualFloor.creationFeeRate_e4) / 1e4;

            // If needs be, limit the fee to ensure that there enough funds to be able to refund winner commitments in full.
            uint256 creationFeePlusWinnerProfits = totalVirtualFloorCommittedAmount - totalWinnerCommitments;

            // ToDo: Replace Math.min with `a < b ? a : b` and check gas usage
            uint256 creationFeeAmount = Math.min(maxCreationFeeAmount, creationFeePlusWinnerProfits);

            winnerProfits = creationFeePlusWinnerProfits - creationFeeAmount;
            virtualFloor.winnerProfits = _toUint192(winnerProfits);

            IERC20 paymentToken = _idToPaymentToken(virtualFloor.paymentTokenId);

            platformFeeAmount =  (creationFeeAmount * virtualFloor.platformFeeRate_e4) / 1e4;
            paymentToken.safeTransfer(platformFeeBeneficiary, platformFeeAmount);

            unchecked {
                ownerFeeAmount = creationFeeAmount - platformFeeAmount;
            }
            // _msgSender() owns the virtual-floor
            paymentToken.safeTransfer(_msgSender(), ownerFeeAmount);
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
        if (virtualFloor.state == VirtualFloorState.Completed) {

            // ToDo: Because of this requirement, losing tokens can never be burnt... would we like to burn them? 
            require(context.outcomeIndex == virtualFloor.winningOutcomeIndex, "NOT_WINNING_OUTCOME");

            uint256 tokenId = ERC1155TokenIds.vfOutcomeTimeslotIdOf(context.virtualFloorId, context.outcomeIndex, context.timeslot);
            uint256 amount = balanceOf(_msgSender(), tokenId);
            uint256 beta_e18 = _calcBeta(virtualFloor, context.timeslot);
            uint256 amountTimesBeta_e18 = amount * beta_e18;
            uint256 profit = (amountTimesBeta_e18 * virtualFloor.winnerProfits) / virtualFloor.aggregateCommitments[virtualFloor.winningOutcomeIndex].amountTimesBeta_e18;
            uint256 payout = amount + profit;
            require(payout > 0, "ZERO_BALANCE");
            _burn(_msgSender(), tokenId, amount);
            _idToPaymentToken(virtualFloor.paymentTokenId).transfer(_msgSender(), payout);
        } else if (virtualFloor.state == VirtualFloorState.Cancelled) {
            uint256 tokenId = ERC1155TokenIds.vfOutcomeTimeslotIdOf(context.virtualFloorId, context.outcomeIndex, context.timeslot);
            uint256 amount = balanceOf(_msgSender(), tokenId);
            require(amount > 0, "ZERO_BALANCE");
            _burn(_msgSender(), tokenId, amount);
            _idToPaymentToken(virtualFloor.paymentTokenId).transfer(_msgSender(), amount);
        } else if (virtualFloor.state == VirtualFloorState.RunningOrClosed) {
            revert("MARKET_NOT_RESOLVED");
        } else if (virtualFloor.state == VirtualFloorState.None) {
            revert("MARKET_NOT_FOUND");
        }
    }

    function claimBatch(VirtualFloorOutcomeTimeslot[] calldata commitments)
        external
    {
        // batch all ERC1155 burns into a single TransferBatch event
        // batch all ERC20 transfers into a single Transfer event,
        // or maybe do not batch across different VirtualFloors, to make it easier
        // to track VirtualFloor in/out-flows
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(IERC165, ERC1155, AccessControl)
        returns (bool)
    {
        return ERC1155.supportsInterface(interfaceId) || AccessControl.supportsInterface(interfaceId);
    }

    // ***** INFORMATIONAL *****

    function getVirtualFloorAggregateCommitments(uint256 virtualFloorId, uint8 outcomeIndex)
        external view returns (AggregateCommitment memory)
    {
        return _virtualFloors[virtualFloorId].aggregateCommitments[outcomeIndex];
    }

    function TIMESLOT_DURATION() external pure returns (uint256) {
        return _TIMESLOT_DURATION;
    }

    // ***** TEMPORARY *****

    /// @dev Temporary convenience function, handy for testing.
    /// Eventually uri would be fixed in constructor,
    /// and even better would be passed as "" to super constructor,
    /// and uri() overridden to avoid SLOADs
    function setURI(string calldata newuri)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        _setURI(newuri);        
    }
}
