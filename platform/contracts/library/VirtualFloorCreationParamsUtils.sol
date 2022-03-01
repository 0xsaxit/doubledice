// SPDX-License-Identifier: Unlicensed

pragma solidity 0.8.12;

import "../interface/IDoubleDice.sol";
import "./FixedPointTypes.sol";

library VirtualFloorCreationParamsUtils {

    function destructure(VirtualFloorCreationParams calldata params)
        internal
        pure
        returns (
            uint256 vfId,
            UFixed256x18 betaOpen_e18,
            UFixed256x18 creationFeeRate_e18,
            uint32 tOpen,
            uint32 tClose,
            uint32 tResolve,
            uint8 nOutcomes,
            IERC20Upgradeable paymentToken,
            EncodedVirtualFloorMetadata calldata metadata
        )
    {
        vfId = params.virtualFloorId;
        betaOpen_e18 = params.betaOpen_e18;
        creationFeeRate_e18 = params.creationFeeRate_e18;
        tOpen = params.tOpen;
        tClose = params.tClose;
        tResolve = params.tResolve;
        nOutcomes = params.nOutcomes;
        paymentToken = params.paymentToken;
        metadata = params.metadata;
    }

}
