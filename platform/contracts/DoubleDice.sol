// SPDX-License-Identifier: Unlicensed

pragma solidity 0.8.12;

import "./CreatorQuota.sol";
import "./ChallengeableCreatorOracle.sol";
import "./VirtualFloorMetadataValidator.sol";

contract DoubleDice is
    ChallengeableCreatorOracle,
    VirtualFloorMetadataValidator,
    CreatorQuota
{

    function initialize(
        BaseDoubleDiceInitParams calldata params,
        IERC20MetadataUpgradeable bondUsdErc20Token_
    )
        external
        initializer
    {
        __ChallengeableCreatorOracle_init(params, bondUsdErc20Token_);
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
        internal override(BaseDoubleDice, ChallengeableCreatorOracle, CreatorQuota)
    {
        ChallengeableCreatorOracle._onVirtualFloorConclusion(vfId);
        CreatorQuota._onVirtualFloorConclusion(vfId);
    }

}
