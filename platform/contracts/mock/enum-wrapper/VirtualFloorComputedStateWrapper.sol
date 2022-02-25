// SPDX-License-Identifier: Unlicensed

pragma solidity 0.8.12;

import "../../IDoubleDice.sol";

contract VirtualFloorStateWrapper {
    VirtualFloorState constant public None = VirtualFloorState.None;
    VirtualFloorState constant public Running = VirtualFloorState.Running;
    VirtualFloorState constant public ClosedUnresolvable = VirtualFloorState.ClosedUnresolvable;
    VirtualFloorState constant public ClosedPreResolvable = VirtualFloorState.ClosedPreResolvable;
    VirtualFloorState constant public ClosedResolvable = VirtualFloorState.ClosedResolvable;
    VirtualFloorState constant public ResolvedWinners = VirtualFloorState.ResolvedWinners;
    VirtualFloorState constant public CancelledResolvedNoWinners = VirtualFloorState.CancelledResolvedNoWinners;
    VirtualFloorState constant public CancelledUnresolvable = VirtualFloorState.CancelledUnresolvable;
    VirtualFloorState constant public CancelledFlagged = VirtualFloorState.CancelledFlagged;
}
