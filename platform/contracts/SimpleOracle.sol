// SPDX-License-Identifier: Unlicensed

pragma solidity 0.8.12;

import "./BaseDoubleDice.sol";

contract SimpleOracle is BaseDoubleDice {

    function __SimpleOracle_init(BaseDoubleDiceInitParams calldata params) internal onlyInitializing {
        __BaseDoubleDice_init(params);
    }

    function resolve(uint256 vfId, uint8 winningOutcomeIndex) external {
        address creator = getVirtualFloorCreator(vfId);
        require(_msgSender() == creator, "NOT_VIRTUALFLOOR_OWNER");
        _resolve(vfId, winningOutcomeIndex, creator);
    }

}
