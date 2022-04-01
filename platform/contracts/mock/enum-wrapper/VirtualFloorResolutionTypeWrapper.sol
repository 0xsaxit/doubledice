// SPDX-License-Identifier: Unlicensed

pragma solidity 0.8.12;

import "../../interface/IDoubleDice.sol";

contract VirtualFloorResolutionTypeWrapper {
    /* solhint-disable const-name-snakecase */
    VirtualFloorResolutionType constant public NoWinners = VirtualFloorResolutionType.NoWinners;
    VirtualFloorResolutionType constant public Winners = VirtualFloorResolutionType.Winners;
    /* solhint-enable const-name-snakecase */
}
