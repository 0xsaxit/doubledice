// SPDX-License-Identifier: Unlicensed
pragma solidity 0.8.12;

import "./IDoubleDice.sol";

interface IDoubleDiceAdmin is
    IDoubleDice
{
    event PlatformFeeBeneficiaryUpdate(address platformFeeBeneficiary);

    function setPlatformFeeBeneficiary(address platformFeeBeneficiary) external;


    event PlatformFeeRateUpdate(UFixed256x18 platformFeeRate_e18);

    function setPlatformFeeRate_e18(UFixed256x18 platformFeeRate_e18) external;


    event PaymentTokenWhitelistUpdate(IERC20Upgradeable indexed token, bool whitelisted);

    function updatePaymentTokenWhitelist(IERC20Upgradeable token, bool isWhitelisted) external;
}
