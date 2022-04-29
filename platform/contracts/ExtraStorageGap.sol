// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.12;


/**
 * @title Reserved storage slots
 * @author 🎲🎲 <dev@doubledice.com>
 */
contract ExtraStorageGap {

    /**
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[200] private __gap;

}
