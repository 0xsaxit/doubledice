// SPDX-License-Identifier: Unlicensed
pragma solidity 0.8.11;

import "./IDoubleDice.sol";

interface IDoubleDiceAdmin is
    IDoubleDice
{
    event VirtualFloorCancellationFlagged(
        uint256 indexed virtualFloorId,
        string reason
    );

    function cancelVirtualFloorFlagged(uint256 virtualFloorId, string calldata reason) external;


    event PlatformFeeRateUpdate(UFixed256x18 platformFeeRate_e18);

    function setPlatformFeeRate_e18(UFixed256x18 platformFeeRate_e18) external;
}
