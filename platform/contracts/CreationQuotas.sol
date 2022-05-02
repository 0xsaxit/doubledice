// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.12;

import "./BaseDoubleDice.sol";
import "./library/Utils.sol";

error CreationQuotaExceeded();

/**
 * @title CreationQuotas extension of BaseDoubleDice contract
 * @author 🎲🎲 <dev@doubledice.com>
 * @notice This contract extends the BaseDoubleDice contract to enforce VF-creation quotas for creators.
 * @dev Quota is temporarily decremented by 1 when creator creates a VF,
 * and quota is restored when VF goes back to a Claimable state.
 */
contract CreationQuotas is BaseDoubleDice {

    using Utils for uint256;

    function __CreationQuotas_init(BaseDoubleDiceInitParams calldata params) internal onlyInitializing {
        __BaseDoubleDice_init(params);
    }

    mapping(address => uint256) public creationQuotas;

    /**
     * @dev Decrement creator quota once VF becomes Active.
     */
    function _onVirtualFloorCreation(VirtualFloorCreationParams calldata params) internal override virtual {
        address creator = getVirtualFloorCreator(params.vfId);
        if (creationQuotas[creator] == 0) revert CreationQuotaExceeded();
        unchecked {
            creationQuotas[creator] -= 1;
        }
    }

    /**
     * @dev Restore creator quota once Active VF becomes Claimable.
     */
    function _onVirtualFloorConclusion(uint256 vfId) internal override virtual {
        address creator = getVirtualFloorCreator(vfId);
        creationQuotas[creator] += 1;
    }

    struct QuotaAdjustment {
        address creator;
        int256 relativeAmount;
    }

    event CreationQuotaAdjustments(QuotaAdjustment[] adjustments);

    /**
     * @notice Operator: Adjust VF-creation quotas for multiple creators.
     */
    function adjustCreationQuotas(QuotaAdjustment[] calldata adjustments)
        external
        onlyRole(OPERATOR_ROLE)
    {
        for (uint256 i = 0; i < adjustments.length; i++) {
            QuotaAdjustment calldata adjustment = adjustments[i];
            creationQuotas[adjustment.creator] = creationQuotas[adjustment.creator].add(adjustment.relativeAmount);
        }
        emit CreationQuotaAdjustments(adjustments);
    }

    /**
     * @dev See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[50] private __gap;

}
