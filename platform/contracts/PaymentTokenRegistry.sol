// SPDX-License-Identifier: Unlicensed

pragma solidity 0.8.11;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

function _paymentTokenToId(IERC20 token) pure returns (bytes10 id) {
    return bytes10(bytes20(address(token)));
} 

/// @dev The basic implementation of this whitelist would consist of a simple `mapping(IERC20 => bool)`,
/// but instead we store a `mapping(bytes10 => (IERC20, bool))`.
/// This allows us to internally reference IERC20 tokens using a 10-byte id rather than a 20-byte address,
/// at no extra storage cost (address + bool = 21 bytes, which still fits into 1 storage slot).
/// In return for the added complexity of this contract,
/// we are then able to store a token reference more efficiently in the main contract.
/// The 10-byte token-id should never leak to the external interface,
/// it should always remain an entirely internal implementation detail.
abstract contract PaymentTokenRegistry is
    AccessControl
{
    bytes32 public constant PAYMENT_TOKEN_WHITELISTER_ROLE = keccak256("PAYMENT_TOKEN_WHITELISTER_ROLE");

    struct Entry {
        IERC20 registeredToken;
        bool isWhitelisted;
    }

    mapping(bytes10 => Entry) private _entries;

    event PaymentTokenWhitelistUpdate(IERC20 indexed token, bool enabled);

    function updatePaymentTokenWhitelist(IERC20 token, bool isWhitelisted)
        external
        onlyRole(PAYMENT_TOKEN_WHITELISTER_ROLE)
    {
        require(address(token) != address(0), "ZERO_ADDRESS");
        Entry storage entry = _entries[_paymentTokenToId(token)];
        require(address(entry.registeredToken) == address(0) || address(entry.registeredToken) == address(token), "Error: ID collision");
        (entry.registeredToken, entry.isWhitelisted) = (token, isWhitelisted);
        emit PaymentTokenWhitelistUpdate(token, isWhitelisted);
    }

    function isPaymentTokenWhitelisted(IERC20 token) public view returns (bool) {
        require(address(token) != address(0), "ZERO_ADDRESS");
        Entry storage entry = _entries[_paymentTokenToId(token)];
        return address(entry.registeredToken) == address(token) && entry.isWhitelisted;
    }

    function _idToPaymentToken(bytes10 id) public view returns (IERC20) {
        return _entries[id].registeredToken;
    }
}
