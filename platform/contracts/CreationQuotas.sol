// SPDX-License-Identifier: Unlicensed

pragma solidity 0.8.12;

import "./BaseDoubleDice.sol";

error CreationQuotaExceeded();

/// @dev Gas-naive implementation
contract CreationQuotas is BaseDoubleDice {

    function __CreationQuotas_init(BaseDoubleDiceInitParams calldata params) internal onlyInitializing {
        __BaseDoubleDice_init(params);
    }

    mapping(address => uint256) public creationQuotas;

    function _onVirtualFloorCreation(VirtualFloorCreationParams calldata params) internal override virtual {
        address creator = getVirtualFloorCreator(params.virtualFloorId);
        if (creationQuotas[creator] == 0) revert CreationQuotaExceeded();
        unchecked {
            creationQuotas[creator] -= 1;
        }
    }

    function _onVirtualFloorConclusion(uint256 vfId) internal override virtual {
        address creator = getVirtualFloorCreator(vfId);
        creationQuotas[creator] += 1;
    }

    struct QuotaChange {
        address creator;
        uint256 amount;
    }

    event QuotaIncreases(QuotaChange[] increases);

    function increaseQuotas(QuotaChange[] calldata increases)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        for (uint256 i = 0; i < increases.length; i++) {
            QuotaChange calldata increase = increases[i];
            creationQuotas[increase.creator] += increase.amount;
        }
        emit QuotaIncreases(increases);
    }

    event QuotaDecreases(QuotaChange[] decreases);

    function decreaseQuotas(QuotaChange[] calldata decreases)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        for (uint256 i = 0; i < decreases.length; i++) {
            QuotaChange calldata decrease = decreases[i];
            creationQuotas[decrease.creator] -= decrease.amount;
        }
        emit QuotaDecreases(decreases);
    }

    /// @dev See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
    uint256[50] private __gap;
}
