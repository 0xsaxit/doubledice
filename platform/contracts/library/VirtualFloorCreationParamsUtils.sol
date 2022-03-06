// SPDX-License-Identifier: Unlicensed

pragma solidity 0.8.12;

import "../BaseDoubleDice.sol";
import "../interface/IDoubleDice.sol";
import "./ERC1155TokenIds.sol";
import "./FixedPointTypes.sol";

library VirtualFloorCreationParamsUtils {

    using ERC1155TokenIds for uint256;
    using FixedPointTypes for UFixed256x18;

    function validatePure(VirtualFloorCreationParams calldata $) internal pure {
        {
            if (!$.virtualFloorId.isValidVirtualFloorId()) revert InvalidVirtualFloorId();
        }
        {
            if (!($.betaOpen_e18.gte(_BETA_CLOSE))) revert BetaOpenTooSmall();
        }
        {
            if (!($.creationFeeRate_e18.lte(UFIXED256X18_ONE))) revert CreationFeeRateTooLarge();
        }
        {
            if (!($.tOpen < $.tClose && $.tClose <= $.tResolve)) revert InvalidTimeline();
        }
        {
            if (!($.nOutcomes >= 2)) revert NotEnoughOutcomes();
        }
    }

    // Allow creation to happen up to 10% into the Open period,
    // to be a bit tolerant to mining delays.
    function tCreateMax(VirtualFloorCreationParams calldata params) internal pure returns (uint256) {
        return params.tOpen + (params.tClose - params.tOpen) / 10;
    }
}
