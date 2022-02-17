// SPDX-License-Identifier: Unlicensed

pragma solidity 0.8.12;

import "../../IDoubleDice.sol";

contract VirtualFloorComputedStateWrapper {
    VirtualFloorComputedState constant public None = VirtualFloorComputedState.None;
    VirtualFloorComputedState constant public Running = VirtualFloorComputedState.Running;
    VirtualFloorComputedState constant public ClosedUnresolvable = VirtualFloorComputedState.ClosedUnresolvable;
    VirtualFloorComputedState constant public ClosedPreResolvable = VirtualFloorComputedState.ClosedPreResolvable;
    VirtualFloorComputedState constant public ClosedResolvable = VirtualFloorComputedState.ClosedResolvable;
    VirtualFloorComputedState constant public ResolvedWinners = VirtualFloorComputedState.ResolvedWinners;
    VirtualFloorComputedState constant public CancelledResolvedNoWinners = VirtualFloorComputedState.CancelledResolvedNoWinners;
    VirtualFloorComputedState constant public CancelledUnresolvable = VirtualFloorComputedState.CancelledUnresolvable;
    VirtualFloorComputedState constant public CancelledFlagged = VirtualFloorComputedState.CancelledFlagged;
}
