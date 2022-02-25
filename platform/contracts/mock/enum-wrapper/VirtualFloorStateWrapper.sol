// SPDX-License-Identifier: Unlicensed

pragma solidity 0.8.12;

import "../../DoubleDice.sol";

contract VirtualFloorInternalStateWrapper {
    VirtualFloorInternalState constant public None = VirtualFloorInternalState.None;
    VirtualFloorInternalState constant public RunningOrClosed = VirtualFloorInternalState.RunningOrClosed;
    VirtualFloorInternalState constant public ResolvedWinners = VirtualFloorInternalState.ResolvedWinners;
    VirtualFloorInternalState constant public CancelledUnresolvable = VirtualFloorInternalState.CancelledUnresolvable;
    VirtualFloorInternalState constant public CancelledResolvedNoWinners = VirtualFloorInternalState.CancelledResolvedNoWinners;
    VirtualFloorInternalState constant public CancelledFlagged = VirtualFloorInternalState.CancelledFlagged;
}
