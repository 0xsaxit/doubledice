// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.12;

import "@openzeppelin/contracts-upgradeable/utils/math/SafeCastUpgradeable.sol";

/**
 * @title VF ids and ERC-1155 commitment-balance ids
 * @author 🎲🎲 <dev@doubledice.com>
 * @notice Logic for VirtualFloor (VF) ids, and for ERC-1155 token-ids
 * representing commitments on specific VF-outcome-timeslot combinations.
 * @dev Both VF ids and VF-outcome-timeslot ids are uint256.
 * The lower 5 bytes of a VF id are always 5 zero-bytes, so the 32 bytes of a VF id
 * always have the shape `VVVVVVVVVVVVVVVVVVVVVVVVVVV00000`.
 * An account that at (4-byte) timeslot `TTTT` commits a `n` ERC-20 token units
 * to a specific (1-byte) outcome index `I` of a VF with id `VVVVVVVVVVVVVVVVVVVVVVVVVVV00000`,
 * will in return be minted a balance of `n` units on the ERC-1155 token-id `VVVVVVVVVVVVVVVVVVVVVVVVVVVITTTT`.
 */
library ERC1155TokenIds {

    using SafeCastUpgradeable for uint256;

    /**
     * @dev The lower 5 bytes of a VF id must always be 0.
     */
    function isValidVirtualFloorId(uint256 value) internal pure returns (bool) {
        return value & 0xff_ff_ff_ff_ff == 0;
    }

    function extractVirtualFloorId(uint256 erc1155TokenId) internal pure returns (uint256) {
        return erc1155TokenId & ~uint256(0xff_ff_ff_ff_ff);
    }

    /**
     * @dev Destructure an ERC-1155 token-id `VVVVVVVVVVVVVVVVVVVVVVVVVVVITTTT` into its
     * `VVVVVVVVVVVVVVVVVVVVVVVVVVV00000`, `I` and `TTTT` components.
     */
    function destructure(
        uint256 erc1155TokenId
    ) internal pure returns (
        uint256 vfId,
        uint8 outcomeIndex,
        uint32 timeslot
    ) {
        vfId = erc1155TokenId & ~uint256(0xff_ff_ff_ff_ff);
        outcomeIndex = uint8((erc1155TokenId >> 32) & 0xff);
        timeslot = uint32(erc1155TokenId & 0xff_ff_ff_ff);
    }

    /**
     * @dev Assemble `VVVVVVVVVVVVVVVVVVVVVVVVVVV00000`, `I` and `TTTT` components
     * into an ERC-1155 token-id `VVVVVVVVVVVVVVVVVVVVVVVVVVVITTTT`.
     * This function should only be called with a valid VF-id.
     */
    function vfOutcomeTimeslotIdOf(
        uint256 validVirtualFloorId,
        uint8 outcomeIndex,
        uint256 timeslot
    )
        internal
        pure
        returns (uint256 tokenId)
    {
        // Since this function should always be called after the VF
        // has already been required to be in one of the non-None states,
        // and a VF can only be in a non-None state if it has a valid id,
        // then this assertion should never fail.
        assert(isValidVirtualFloorId(validVirtualFloorId));

        tokenId = uint256(bytes32(abi.encodePacked(
            bytes27(bytes32(validVirtualFloorId)), //   27 bytes
            outcomeIndex,                          // +  1 byte
            timeslot.toUint32()                    // +  4 bytes
        )));                                       // = 32 bytes
    }

}
