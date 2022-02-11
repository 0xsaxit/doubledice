// SPDX-License-Identifier: Unlicensed

pragma solidity 0.8.11;

import "../../DoubleDice.sol";

contract VirtualFloorStateWrapper {
    VirtualFloorState constant public None = VirtualFloorState.None;
    VirtualFloorState constant public RunningOrClosed = VirtualFloorState.RunningOrClosed;
    VirtualFloorState constant public ResolvedWinners = VirtualFloorState.ResolvedWinners;
    VirtualFloorState constant public CancelledUnresolvable = VirtualFloorState.CancelledUnresolvable;
    VirtualFloorState constant public CancelledResolvedNoWinners = VirtualFloorState.CancelledResolvedNoWinners;
    VirtualFloorState constant public CancelledFlagged = VirtualFloorState.CancelledFlagged;
}
