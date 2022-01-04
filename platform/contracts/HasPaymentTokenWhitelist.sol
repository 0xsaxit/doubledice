// SPDX-License-Identifier: Unlicensed

pragma solidity 0.8.11;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

abstract contract HasPaymentTokenWhitelist is
    AccessControl
{
    bytes32 public constant PAYMENT_TOKEN_WHITELISTER_ROLE = keccak256("PAYMENT_TOKEN_WHITELISTER_ROLE");

    mapping(IERC20 => bool) private _paymentTokenWhitelist;

    event PaymentTokenWhitelistUpdate(IERC20 indexed token, bool enabled);

    function updatePaymentTokenWhitelist(IERC20 token, bool isWhitelisted)
        external
        onlyRole(PAYMENT_TOKEN_WHITELISTER_ROLE)
    {
        _paymentTokenWhitelist[token] = isWhitelisted;
        emit PaymentTokenWhitelistUpdate(token, isWhitelisted);
    }

    function isPaymentTokenWhitelisted(IERC20 token) public view returns (bool) {
        return _paymentTokenWhitelist[token];
    }
}
