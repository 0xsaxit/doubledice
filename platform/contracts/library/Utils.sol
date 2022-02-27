// SPDX-License-Identifier: Unlicensed

pragma solidity 0.8.12;

library Utils {
    function toUint192(uint256 value) internal pure returns (uint192) {
        require(value <= type(uint192).max, "SafeCast: value doesn't fit in 192 bits");
        return uint192(value);
    }
}
