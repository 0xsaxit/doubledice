// SPDX-License-Identifier: Unlicensed

pragma solidity 0.8.11;

import "@openzeppelin/contracts/utils/math/SafeCast.sol";

library ERC1155TokenIds {

    using SafeCast for uint256;

    /// @dev Any id having lower 5 bytes set to 0 is a valid virtual-floor id.
    /// A valid virtual-floor id doubles as both the virtual-floor's id,
    /// and as the ERC-1155 token id representing ownership of that virtual-floor.
    function isValidVirtualFloorId(uint256 value) internal pure returns (bool) {
        return value & 0xffffffffff == 0;
    }

    function vfOutcomeTimeslotIdOf(
        uint256 validVirtualFloorId,
        uint8 outcomeIndex,
        uint256 timeslot
    )
        internal
        pure
        returns (uint256 tokenId)
    {
        // Since this function should always be called after the virtual-floor
        // has already been required to be in one of the non-None states,
        // and a virtual-floor can only be in a non-None state if it has a valid id,
        // then this assertion should never fail.
        assert(isValidVirtualFloorId(validVirtualFloorId));

        tokenId = uint256(bytes32(abi.encodePacked(
            bytes27(bytes32(validVirtualFloorId)), //   27 bytes
            outcomeIndex,                          // +  1 byte
            timeslot.toUint32()                    // +  4 bytes
        )));                                       // = 32 bytes
    }

}
