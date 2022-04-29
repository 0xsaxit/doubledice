// SPDX-License-Identifier: Unlicensed

pragma solidity 0.8.12;

import "../../../BaseDoubleDice.sol";

contract VirtualFloorResolutionTypeWrapper {
    /* solhint-disable const-name-snakecase */
    BaseDoubleDice.VirtualFloorResolutionType constant public NoWinners = BaseDoubleDice.VirtualFloorResolutionType.NoWinners;
    BaseDoubleDice.VirtualFloorResolutionType constant public Winners = BaseDoubleDice.VirtualFloorResolutionType.Winners;
    /* solhint-enable const-name-snakecase */
}
