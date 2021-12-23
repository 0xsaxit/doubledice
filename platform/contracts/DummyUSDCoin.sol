// SPDX-License-Identifier: Unlicensed

pragma solidity 0.8.10;

import "@openzeppelin/contracts/token/ERC20/presets/ERC20PresetMinterPauser.sol";

contract DummyUSDCoin is ERC20PresetMinterPauser("DummyUSDCoin", "USDC") {

    function decimals() public pure override returns (uint8) {
        return 6;
    }

}
