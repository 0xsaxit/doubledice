// SPDX-License-Identifier: Unlicensed

pragma solidity 0.8.12;

struct Entry {
    address addr;
    bool isWhitelisted;
}

type AddressWhitelistKey is bytes10;

struct AddressWhitelist {
    mapping(AddressWhitelistKey => Entry) _entries;
}

/// @dev Instead of using a `mapping(address => bool)`, a `mapping(bytes10 => (address, bool))` is used,
/// at no extra storage cost (because address + bool = 21 bytes, which still fit into 1 storage slot.)
/// In return for the added complexity, it is then possible store a registered address more compactly
/// in the main contract.
/// The 10-byte whitelist-key should never leak to the external interface, but should always remain internal.
library AddressWhitelists {

    using AddressWhitelists for address;

    function toAddressWhitelistKey(address addr) internal pure returns (AddressWhitelistKey) {
        return AddressWhitelistKey.wrap(bytes10(bytes20(address(addr))));
    }

    function setWhitelistStatus(AddressWhitelist storage whitelist, address addr, bool isWhitelisted_) internal {
        require(addr != address(0), "ZERO_ADDRESS");
        Entry storage entry = whitelist._entries[addr.toAddressWhitelistKey()];
        require(entry.addr == address(0) || entry.addr == addr, "Error: Address whitelist key collision");
        (entry.addr, entry.isWhitelisted) = (addr, isWhitelisted_);
    }

    function isWhitelisted(AddressWhitelist storage whitelist, address addr) internal view returns (bool) {
        require(addr != address(0), "ZERO_ADDRESS");
        Entry storage entry = whitelist._entries[addr.toAddressWhitelistKey()];
        return entry.addr == addr && entry.isWhitelisted;
    }

    function addressForKey(AddressWhitelist storage whitelist, AddressWhitelistKey key) internal view returns (address) {
        return whitelist._entries[key].addr;
    }
}
