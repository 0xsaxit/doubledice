// SPDX-License-Identifier: Unlicensed
pragma solidity 0.8.12;

/// @dev Kept here so that Graph can generate wrappers for them.
/// ToDo: To be dropped before final release.
contract Legacy {

    // CreationQuotas
    struct QuotaChange { address creator; uint256 amount; }
    event QuotaIncreases(QuotaChange[] increases);
    event QuotaDecreases(QuotaChange[] decreases);

}
