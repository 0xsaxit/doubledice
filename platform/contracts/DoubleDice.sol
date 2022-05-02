// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.12;

import "./ChallengeableCreatorOracle.sol";
import "./CreationQuotas.sol";
import "./VirtualFloorMetadataValidator.sol";

/**
 *                            ________
 *                 ________  / o   o /\
 *                /     o /\/   o   /o \
 *               /   o   /  \o___o_/o   \
 *              /_o_____/o   \     \   o/
 *              \ o   o \   o/  o   \ o/
 *  ______     __\ o   o \  /\_______\/       _____     ____    ____    ____   _______
 * |  __  \   /   \_o___o_\/ |  _ \  | |     |  ___|   |  _ \  |_  _|  / ___| |   ____|
 * | |  \  | | / \ | | | | | | |_| | | |     | |_      | | \ |   ||   | /     |  |
 * | |   | | | | | | | | | | |  _ <  | |     |  _|     | | | |   I|   | |     |  |__
 * |D|   |D| |O\_/O| |U|_|U| |B|_|B| |L|___  |E|___    |D|_/D|  _I|_  |C\___  |EEEEE|
 * |D|__/DD|  \OOO/   \UUU/  |BBBB/  |LLLLL| |EEEEE|   |DDDD/  |IIII|  \CCCC| |EE|____
 * |DDDDDD/  ================================================================ |EEEEEEE|
 *
 * @title DoubleDice protocol contract
 * @author 🎲🎲 <dev@doubledice.com>
 * @custom:security-contact dev@doubledice.com
 * @notice Enables accounts to commit an amount of ERC-20 tokens to a prediction that a specific future event,
 * or VirtualFloor (VF), resolves to a specific outcome from a predefined list of 2 or more mutually-exclusive
 * possible outcomes.
 * Users committing funds to a specific VF outcome at a specific timepoint are issued with a commitment receipt
 * in the form of a ERC-1155 commitment-balance.
 * If a VF is resolved to a winning outcome and winner profits are available, the commitment-balance may be redeemed
 * by its holder for the corresponding share of the profit.
 * @dev Merges all the multiple BaseDoubleDice contract extensions into one final contract.
 */
contract DoubleDice is
    ChallengeableCreatorOracle,
    CreationQuotas,
    VirtualFloorMetadataValidator
{

    function initialize(
        BaseDoubleDiceInitParams calldata params,
        IERC20MetadataUpgradeable bondUsdErc20Token_
    )
        external
        initializer
        multipleInheritanceLeafInitializer
    {
        __ChallengeableCreatorOracle_init(params, bondUsdErc20Token_);
        __VirtualFloorMetadataValidator_init(params);
        __CreationQuotas_init(params);
    }

    function _onVirtualFloorCreation(VirtualFloorCreationParams calldata params)
        internal override(BaseDoubleDice, VirtualFloorMetadataValidator, CreationQuotas)
    {
        CreationQuotas._onVirtualFloorCreation(params);
        VirtualFloorMetadataValidator._onVirtualFloorCreation(params);
    }

    function _onVirtualFloorConclusion(uint256 vfId)
        internal override(BaseDoubleDice, ChallengeableCreatorOracle, CreationQuotas)
    {
        ChallengeableCreatorOracle._onVirtualFloorConclusion(vfId);
        CreationQuotas._onVirtualFloorConclusion(vfId);
    }

}
