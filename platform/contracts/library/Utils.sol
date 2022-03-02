// SPDX-License-Identifier: Unlicensed

pragma solidity 0.8.12;

library Utils {

    function toUint192(uint256 value) internal pure returns (uint192) {
        require(value <= type(uint192).max, "SafeCast: value doesn't fit in 192 bits");
        return uint192(value);
    }

    function isEmpty(string memory value) internal pure returns (bool) {
        return bytes(value).length == 0;
    }

    function add(uint256 a, int256 b) internal pure returns (uint256) {
        if (b >= 0) {
            return a + uint256(b);
        } else {
            return a - uint256(-b);
        }
    }

}
