// SPDX-License-Identifier: Unlicensed

pragma solidity 0.8.12;

import "./BaseDoubleDice.sol";
import "./SimpleOracle.sol";
import "./VirtualFloorMetadataValidator.sol";

contract DoubleDice is
    SimpleOracle,
    VirtualFloorMetadataValidator
{

    function initialize(BaseDoubleDiceInitParams calldata params) external initializer {
        __SimpleOracle_init(params);
        __VirtualFloorMetadataValidator_init(params);
    }

    function _onVirtualFloorCreation(VirtualFloorCreationParams calldata params)
        internal pure override(BaseDoubleDice, VirtualFloorMetadataValidator)
    {
        VirtualFloorMetadataValidator._onVirtualFloorCreation(params);
    }

}
