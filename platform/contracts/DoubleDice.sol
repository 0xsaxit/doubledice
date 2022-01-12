// SPDX-License-Identifier: Unlicensed

pragma solidity 0.8.11;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "./IDoubleDice.sol";
import "./HasPaymentTokenWhitelist.sol";

uint256 constant _TIMESLOT_DURATION = 60 seconds;

uint256 constant _MAX_OUTCOMES_PER_VIRTUAL_FLOOR = 256;

uint256 constant _FEE_RATE_E18 = 0.01e18;

uint256 constant _TOKENID_TYPE_MASK         = 0xff << 248;
uint256 constant _TOKENID_TYPE_VIRTUALFLOOR = 0x00 << 248;
uint256 constant _TOKENID_TYPE_COMMITMENT   = 0x01 << 248;

struct AggregateCommitment {
    uint256 amount;
    uint256 weightedAmount;
}

enum VirtualFloorState {
    None,

    /// @dev Running if t < tClose else Closed
    RunningOrClosed,

    Completed,

    Cancelled
}

/// @dev Suppose that you plotted `(x = t_open, y = beta_max)` and `(x = t_close, y = 1)`
/// 
/// and joined the two points with a line that shows how beta decreases with time
/// 
/// the gradient is `(1 - beta_max) ÷ (t_close - t_open)`, or `-(beta_max - 1)/(t_close - t_open)`
/// 
/// Let’s call that `-betaGradient`
/// 
/// So `betaGradient = (beta_max - 1)/(t_close - t_open)`
/// 
/// And `beta(t) = 1 + betaGradient * (t_close - t)`
/// 
/// Like this, we just store `betaGradient` and don't need to worry about opening time. The virtualFloor “starts” whenever it is created on chain
/// and `beta` decreases linearly at the specified rate until it reaches `beta = 1` at exactly `t = t_close`.
/// 
/// The net result is that the linearly decreasing beta is still there, and concept of predicting earlier yielding higher returns is intact,
/// but there is one complexity less, i.e. the current concept of an “opening time” and the `beta` standing constant at `beta_max`
/// until that opening time arrives, disappears, and with it disappears the complexity of virtualFloor-creation failing because the
/// creation-transaction fails because it is mined later than the opening-time.
/// 
/// Nevertheless nothing holds us from restoring previous behaviour whenever we like.
struct VirtualFloor {

    VirtualFloorState state;  //    1 byte
    uint32 tClose;            // +  4 bytes 
    uint32 tResolve;          // +  4 bytes
    uint8 nOutcomes;          // +  1 byte
    uint8 outcome;            // +  1 byte
    IERC20 paymentToken;      // + 20 bytes
                              // = 31 bytes => packed into 1 32-byte slot

    uint256 betaGradient;

    // By using a fixed-length array, we do not waste a storage slot for length
    AggregateCommitment[_MAX_OUTCOMES_PER_VIRTUAL_FLOOR] aggregateCommitments;

    // could be recalculated every time... but we cache it
    uint256 winnerProfits;
}

function _calcCommitmentERC1155TokenId(uint256 virtualFloorId, uint8 outcomeIndex, uint256 timeslot) pure returns (uint256 tokenId) {
    tokenId = uint256(keccak256(abi.encodePacked(
        virtualFloorId,
        outcomeIndex,
        timeslot
    )));

    // tokenId highest byte overwritten with 0x01 to mark it as a commitment-type ERC-1155 tokenId
    tokenId = (tokenId & ~_TOKENID_TYPE_MASK) | _TOKENID_TYPE_COMMITMENT;
}

contract DoubleDice is
    IDoubleDice,
    ERC1155,
    AccessControl,
    HasPaymentTokenWhitelist
{
    using SafeERC20 for IERC20;

    modifier onlyVirtualFloorOwner(uint256 virtualFloorId) {
        require(balanceOf(_msgSender(), virtualFloorId) == 1, "NOT_VIRTUALFLOOR_OWNER");
        _;
    }

    address public feeBeneficiary;

    constructor(string memory uri_, address feeBeneficiary_)
        ERC1155(uri_) // ToDo: Override uri() to avoid SLOADs
    {
        _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());
        feeBeneficiary = feeBeneficiary_;
    }

    mapping(uint256 => VirtualFloor) public _virtualFloors;

    function createVirtualFloor(uint256 virtualFloorId, uint256 betaGradient, uint32 tClose, uint32 tResolve, uint8 nOutcomes, IERC20 paymentToken)
        external
    {
        VirtualFloor storage virtualFloor = _virtualFloors[virtualFloorId];
        require(virtualFloor.state == VirtualFloorState.None, "MARKET_DUPLICATE");

        // Note: No constraints on betaGradient
        require(block.timestamp < tClose, "Error: tClose <= t");
        require(tClose < tResolve, "Error: tResolve <= tClose");
        require(nOutcomes >= 2, "Error: nOutcomes < 2");
        require(isPaymentTokenWhitelisted(paymentToken), "Error: Payment token is not whitelisted");

        virtualFloor.state = VirtualFloorState.RunningOrClosed;
        virtualFloor.paymentToken = paymentToken;
        virtualFloor.betaGradient = betaGradient;
        virtualFloor.tClose = tClose;
        virtualFloor.tResolve = tResolve;
        virtualFloor.nOutcomes = nOutcomes;

        virtualFloor.state = VirtualFloorState.RunningOrClosed;

        emit VirtualFloorCreation({
            virtualFloorId: virtualFloorId,
            creator: _msgSender(),
            betaGradient: betaGradient,
            tClose: tClose,
            tResolve: tResolve,
            nOutcomes: nOutcomes,
            paymentToken: paymentToken
        });

        // Represent this virtual-floor as an ERC-1155 *non-fungible* token.
        // Require virtualfloor-type token ids (0x00-padded to 32 bytes) to start with 0x00,
        // to distinguish from commitment-type token ids that start with 0x01.
        require(virtualFloorId & _TOKENID_TYPE_MASK == _TOKENID_TYPE_VIRTUALFLOOR, "INVALID_VIRTUAL_FLOOR_ID");
        _mint({
            to: _msgSender(),
            id: virtualFloorId,
            amount: 1,
            data: hex""
        });
    }

    function commitToVirtualFloor(uint256 virtualFloorId, uint8 outcomeIndex, uint256 amount)
        external
    {
        VirtualFloor storage virtualFloor = _virtualFloors[virtualFloorId];
        require(virtualFloor.state == VirtualFloorState.RunningOrClosed, "MARKET_NOT_FOUND");

        // Quantize to 1-minute bins to make it simple to accumulate subsequent commitments into 1 token while testing
        uint256 timeslot = block.timestamp - (block.timestamp % _TIMESLOT_DURATION);

        require(timeslot < virtualFloor.tClose, "MARKET_CLOSED");
        require(outcomeIndex < virtualFloor.nOutcomes, "OUTCOME_INDEX_OUT_OF_RANGE");
        require(amount > 0, "AMOUNT_ZERO");

        virtualFloor.paymentToken.safeTransferFrom(_msgSender(), address(this), amount);

        AggregateCommitment storage aggregateCommitments = virtualFloor.aggregateCommitments[outcomeIndex];
        uint256 beta = 1e18 + virtualFloor.betaGradient * (virtualFloor.tClose - timeslot);
        uint256 weightedAmount = beta * amount;
        aggregateCommitments.amount += amount;
        aggregateCommitments.weightedAmount += weightedAmount;
        uint256 tokenId = _calcCommitmentERC1155TokenId(virtualFloorId, outcomeIndex, timeslot);

        // From the Graph's point of view...
        // First we declare the parameters bound to a particular tokenId...
        emit UserCommitment(virtualFloorId, outcomeIndex, timeslot, amount, tokenId);

        // ... and only then do we refer to it in transfers.
        _mint({
            to: _msgSender(),
            id: tokenId,
            amount: amount,
            data: hex""
        });
    }

    function resolve(uint256 virtualFloorId, uint8 outcomeIndex)
        external
        onlyVirtualFloorOwner(virtualFloorId)
    {
        VirtualFloor storage virtualFloor = _virtualFloors[virtualFloorId];
        require(virtualFloor.state == VirtualFloorState.RunningOrClosed, "MARKET_INEXISTENT_OR_IN_WRONG_STATE");

        require(block.timestamp >= virtualFloor.tResolve, "TOO_EARLY_TO_RESOLVE");
        require(outcomeIndex < virtualFloor.nOutcomes, "OUTCOME_INDEX_OUT_OF_RANGE");

        virtualFloor.outcome = outcomeIndex;

        uint256 totalVirtualFloorCommittedAmount = 0;
        for (uint256 i = 0; i < virtualFloor.nOutcomes; i++) {
            totalVirtualFloorCommittedAmount += virtualFloor.aggregateCommitments[i].amount;
        }

        uint256 totalWinnerCommitments = virtualFloor.aggregateCommitments[outcomeIndex].amount;

        VirtualFloorResolutionType resolutionType;
        uint256 feeAmount;
        uint256 winnerProfits;

        if (totalWinnerCommitments == 0) {
            // All trade commitments fully refunded, no fee taken.
            virtualFloor.state = VirtualFloorState.Cancelled;
            resolutionType = VirtualFloorResolutionType.NoWinners;
            feeAmount = 0;
            winnerProfits = 0;
        } else if (totalWinnerCommitments == totalVirtualFloorCommittedAmount) {
            // All trade commitments fully refunded, no fee taken.
            virtualFloor.state = VirtualFloorState.Cancelled;
            resolutionType = VirtualFloorResolutionType.AllWinners;
            feeAmount = 0;
            winnerProfits = 0;
        } else {
            virtualFloor.state = VirtualFloorState.Completed;
            resolutionType = VirtualFloorResolutionType.SomeWinners;

            // Winner commitments refunded, fee taken, then remainder split between winners proportionally by `commitment * beta`.
            uint256 maxVirtualFloorFeeAmount = (_FEE_RATE_E18 * totalVirtualFloorCommittedAmount) / 1e18;

            // If needs be, limit the fee to ensure that there enough funds to be able to refund winner commitments in full.
            uint256 feePlusWinnerProfits = totalVirtualFloorCommittedAmount - totalWinnerCommitments;

            // ToDo: Replace Math.min with `a < b ? a : b` and check gas usage
            feeAmount = Math.min(maxVirtualFloorFeeAmount, feePlusWinnerProfits);

            winnerProfits = feePlusWinnerProfits - feeAmount;
            virtualFloor.winnerProfits = winnerProfits;

            virtualFloor.paymentToken.safeTransfer(feeBeneficiary, feeAmount);
        }

        emit VirtualFloorResolution({
            virtualFloorId: virtualFloorId,
            outcomeIndex: outcomeIndex,
            resolutionType: resolutionType,
            winnerProfits: winnerProfits,
            feeAmount: feeAmount
        });
    }

    function claim(VirtualFloorOutcomeTimeslot calldata context)
        external
    {
        VirtualFloor storage virtualFloor = _virtualFloors[context.virtualFloorId];
        if (virtualFloor.state == VirtualFloorState.Completed) {

            // ToDo: Because of this requirement, losing tokens can never be burnt... would we like to burn them? 
            require(context.outcomeIndex == virtualFloor.outcome, "NOT_WINNING_OUTCOME");

            uint256 tokenId = _calcCommitmentERC1155TokenId(context.virtualFloorId, context.outcomeIndex, context.timeslot);
            uint256 amount = balanceOf(_msgSender(), tokenId);
            uint256 beta = 1e18 + virtualFloor.betaGradient * (virtualFloor.tClose - context.timeslot);
            uint256 weightedAmount = beta * amount;
            uint256 profit = (weightedAmount * virtualFloor.winnerProfits) / virtualFloor.aggregateCommitments[virtualFloor.outcome].weightedAmount;
            uint256 payout = amount + profit;
            require(payout > 0, "ZERO_BALANCE");
            _burn(_msgSender(), tokenId, amount);
            virtualFloor.paymentToken.transfer(_msgSender(), payout);
        } else if (virtualFloor.state == VirtualFloorState.Cancelled) {
            uint256 tokenId = _calcCommitmentERC1155TokenId(context.virtualFloorId, context.outcomeIndex, context.timeslot);
            uint256 amount = balanceOf(_msgSender(), tokenId);
            require(amount > 0, "ZERO_BALANCE");
            _burn(_msgSender(), tokenId, amount);
            virtualFloor.paymentToken.transfer(_msgSender(), amount);
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

    function FEE_RATE_E18() external pure returns (uint256) {
        return _FEE_RATE_E18;
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
