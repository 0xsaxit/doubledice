// SPDX-License-Identifier: Unlicensed

pragma solidity 0.8.12;

import "../BaseDoubleDice.sol";
import "../interface/IDoubleDice.sol";
import "./FixedPointTypes.sol";

uint256 constant _MIN_POSSIBLE_COMMITMENT_AMOUNT = 1;
uint256 constant _MAX_POSSIBLE_COMMITMENT_AMOUNT = type(uint256).max;

library VirtualFloors {

    using FixedPointTypes for UFixed256x18;
    using FixedPointTypes for UFixed32x6;
    using VirtualFloors for VirtualFloor;

    function state(VirtualFloor storage vf) internal view returns (VirtualFloorState) {
        VirtualFloorInternalState internalState = vf.internalState;
        if (internalState == VirtualFloorInternalState.None) {
            return VirtualFloorState.None;
        } else if (internalState == VirtualFloorInternalState.RunningOrClosed) {
            if (block.timestamp < vf.tClose) {
                return VirtualFloorState.Running;
            } else {
                if (vf.nonzeroOutcomeCount >= 2) {
                    if (block.timestamp < vf.tResolve) {
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
        UFixed256x18 betaOpenMinusBetaClose = vf.betaOpenMinusBetaClose.toUFixed256x18();
        return _BETA_CLOSE.add(betaOpenMinusBetaClose.mul0(vf.tClose - t).div0(vf.tClose - vf.tOpen));
    }

    function totalCommitmentsToAllOutcomesPlusBonus(VirtualFloor storage vf) internal view returns (uint256 total) {
        total = vf.bonusAmount;
        for (uint256 i = 0; i < vf.nOutcomes; i++) {
            total += vf.outcomeTotals[i].amount;
        }
    }

    function minMaxCommitmentAmounts(VirtualFloor storage vf) internal view returns (uint256 min, uint256 max) {
        min = vf._optionalMinCommitmentAmount;
        max = vf._optionalMaxCommitmentAmount;
        if (min == UNSPECIFIED_ZERO) {
            min = _MIN_POSSIBLE_COMMITMENT_AMOUNT;
        }
        if (max == UNSPECIFIED_ZERO) {
            max = _MAX_POSSIBLE_COMMITMENT_AMOUNT;
        }
    }

}
