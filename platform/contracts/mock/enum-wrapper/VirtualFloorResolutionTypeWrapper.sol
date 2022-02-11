// SPDX-License-Identifier: Unlicensed

pragma solidity 0.8.11;

import "../../IDoubleDice.sol";

contract VirtualFloorResolutionTypeWrapper {
    VirtualFloorResolutionType constant public CancelledNoWinners = VirtualFloorResolutionType.CancelledNoWinners;
    VirtualFloorResolutionType constant public Winners = VirtualFloorResolutionType.Winners;
}
