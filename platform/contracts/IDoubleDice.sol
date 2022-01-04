// SPDX-License-Identifier: Unlicensed
pragma solidity 0.8.11;

import "@openzeppelin/contracts/access/IAccessControl.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

struct VirtualFloorOutcomeTimeslot {
    bytes32 virtualFloorId;
    uint8 outcomeIndex;
    uint256 timeslot;
}

enum VirtualFloorResolutionType { NoWinners, SomeWinners, AllWinners }

interface IDoubleDice is
    IAccessControl,
    IERC1155
{
    event VirtualFloorCreation(
        bytes32 indexed virtualFloorId,
        uint256 betaGradient,
        uint32 tClose,
        uint32 tResolve,
        uint8 nOutcomes,
        IERC20 paymentToken
    );

    event UserCommitment(
        bytes32 indexed virtualFloorId,
        uint8 indexed outcomeIndex,
        uint256 indexed timeslot,
        uint256 amount,
        uint256 tokenId
    );

    event VirtualFloorResolution(
        bytes32 indexed virtualFloorId,
        uint8 outcomeIndex,
        VirtualFloorResolutionType resolutionType,
        uint256 winnerProfits,
        uint256 feeAmount
    );


    function createVirtualFloor(bytes32 virtualFloorId, uint256 betaGradient, uint32 tClose, uint32 tResolve, uint8 nOutcomes, IERC20 paymentToken) external;

    function commitToVirtualFloor(bytes32 virtualFloorId, uint8 outcomeIndex, uint256 amount) external;

    function resolve(bytes32 virtualFloorId, uint8 outcomeIndex) external;

    function claim(VirtualFloorOutcomeTimeslot calldata context) external;

    function claimBatch(VirtualFloorOutcomeTimeslot[] calldata commitments) external;

    /// @notice The timeline is split into a number of non-overlapping consecutive timeslots of this duration.
    /// Token amounts committed to a specific outcome of a specific virtual-floor within a specific timeslot
    /// are only fungible between themselves.
    function TIMESLOT_DURATION() external view returns (uint256);

    function FEE_RATE_E18() external view returns (uint256);

    function feeBeneficiary() external view returns (address);
}
