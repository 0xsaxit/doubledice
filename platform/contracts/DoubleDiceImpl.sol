// SPDX-License-Identifier: Unlicensed

pragma solidity 0.8.12;

import "./CreatorQuota.sol";
import "./SimpleOracle.sol";
import "./VirtualFloorMetadataValidator.sol";

contract DoubleDice is
    SimpleOracle,
    VirtualFloorMetadataValidator,
    CreatorQuota
{

    function initialize(BaseDoubleDiceInitParams calldata params) external initializer {
        __SimpleOracle_init(params);
        __VirtualFloorMetadataValidator_init(params);
        __CreatorQuota_init(params);
    }

    function _onVirtualFloorCreation(VirtualFloorCreationParams calldata params)
        internal override(BaseDoubleDice, VirtualFloorMetadataValidator, CreatorQuota)
    {
        CreatorQuota._onVirtualFloorCreation(params);
        VirtualFloorMetadataValidator._onVirtualFloorCreation(params);
    }

    function _onVirtualFloorConclusion(uint256 vfId)
        internal override(BaseDoubleDice, CreatorQuota)
    {
        CreatorQuota._onVirtualFloorConclusion(vfId);
    }

}
