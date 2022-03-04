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
            require($.virtualFloorId.isValidVirtualFloorId(), "INVALID_VIRTUALFLOOR_ID");
        }
        {
            require($.betaOpen_e18.gte(_BETA_CLOSE), "Error: betaOpen < 1.0");
        }
        {
            require($.creationFeeRate_e18.lte(UFIXED256X18_ONE), "Error: creationFeeRate > 1.0");
        }
        {
            require($.tOpen < $.tClose && $.tClose <= $.tResolve, "Error: tOpen >= tClose|Error: tClose > tResolve");
        }
        {
            require($.nOutcomes >= 2, "Error: nOutcomes < 2");
        }
    }

    // Allow creation to happen up to 10% into the Open period,
    // to be a bit tolerant to mining delays.
    function tCreateMax(VirtualFloorCreationParams calldata params) internal pure returns (uint256) {
        return params.tOpen + (params.tClose - params.tOpen) / 10;
    }
}
