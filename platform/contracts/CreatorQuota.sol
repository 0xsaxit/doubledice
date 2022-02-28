// SPDX-License-Identifier: Unlicensed

pragma solidity 0.8.12;

import "./BaseDoubleDice.sol";

error QuotaExceeded();

/// @dev Gas-naive implementation
contract CreatorQuota is BaseDoubleDice {

    function __CreatorQuota_init(BaseDoubleDiceInitParams calldata params) internal onlyInitializing {
        __BaseDoubleDice_init(params);
    }

    mapping(address => uint256) public quotas;

    function _onVirtualFloorCreation(VirtualFloorCreationParams calldata params) internal override virtual {
        address creator = getVirtualFloorCreator(params.virtualFloorId);
        if (quotas[creator] == 0) revert QuotaExceeded();
        unchecked {
            quotas[creator] -= 1;
        }
    }

    function _onVirtualFloorConclusion(uint256 vfId) internal override virtual {
        address creator = getVirtualFloorCreator(vfId);
        quotas[creator] += 1;
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
            quotas[increase.creator] += increase.amount;
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
            quotas[decrease.creator] -= decrease.amount;
        }
        emit QuotaDecreases(decreases);
    }
}
