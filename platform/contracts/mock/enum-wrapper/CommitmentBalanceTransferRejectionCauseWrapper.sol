// SPDX-License-Identifier: Unlicensed

pragma solidity 0.8.12;

import "../../IDoubleDice.sol";

contract CommitmentBalanceTransferRejectionCauseWrapper {
    CommitmentBalanceTransferRejectionCause constant public WrongState = CommitmentBalanceTransferRejectionCause.WrongState;
    CommitmentBalanceTransferRejectionCause constant public TooLate = CommitmentBalanceTransferRejectionCause.TooLate;
    CommitmentBalanceTransferRejectionCause constant public VirtualFloorUnresolvable = CommitmentBalanceTransferRejectionCause.VirtualFloorUnresolvable;
}
