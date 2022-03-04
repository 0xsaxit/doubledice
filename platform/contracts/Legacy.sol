// SPDX-License-Identifier: Unlicensed
pragma solidity 0.8.12;

import "./interface/IDoubleDice.sol";

/// @dev Kept here so that Graph can generate wrappers for them.
/// ToDo: To be dropped before final release.
contract Legacy {

    // CreationQuotas
    struct QuotaChange { address creator; uint256 amount; }
    event QuotaIncreases(QuotaChange[] increases);
    event QuotaDecreases(QuotaChange[] decreases);

    // IDoubleDice
    event VirtualFloorCreation(
        uint256 indexed virtualFloorId,
        address indexed creator,
        UFixed256x18 betaOpen_e18,
        UFixed256x18 creationFeeRate_e18,
        UFixed256x18 platformFeeRate_e18,
        uint32 tOpen,
        uint32 tClose,
        uint32 tResolve,
        uint8 nOutcomes,
        IERC20Upgradeable paymentToken,
        // no bonusAmount
        EncodedVirtualFloorMetadata metadata
    );

}
