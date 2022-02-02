// SPDX-License-Identifier: Unlicensed
pragma solidity 0.8.11;

import "@openzeppelin/contracts/access/IAccessControl.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "./VirtualFloorMetadata.sol";

struct VirtualFloorOutcomeTimeslot {
    uint256 virtualFloorId;
    uint8 outcomeIndex;
    uint256 timeslot;
}

enum VirtualFloorResolutionType { NoWinners, SomeWinners }

interface IDoubleDice is
    IAccessControl,
    IERC1155
{
    event VirtualFloorCreation(
        uint256 indexed virtualFloorId,
        address indexed creator,
        uint256 betaOpen_e18,
        uint256 creationFeeRate_e18,
        uint256 platformFeeRate_e18,
        uint32 tOpen,
        uint32 tClose,
        uint32 tResolve,
        uint8 nOutcomes,
        IERC20 paymentToken,
        VirtualFloorMetadata metadata
    );

    event UserCommitment(
        uint256 indexed virtualFloorId,
        address indexed committer,
        uint8 outcomeIndex,
        uint256 timeslot,
        uint256 amount,
        uint256 beta_e18,
        uint256 tokenId
    );

    event VirtualFloorCancellation(
        uint256 indexed virtualFloorId
    );

    event VirtualFloorResolution(
        uint256 indexed virtualFloorId,
        uint8 winningOutcomeIndex,
        VirtualFloorResolutionType resolutionType,
        uint256 winnerProfits,
        uint256 platformFeeAmount,
        uint256 ownerFeeAmount
    );

    struct VirtualFloorCreationParams {
        uint256 virtualFloorId;
        uint256 betaOpen_e18;

        /// @dev Purposely called "creation-fee" not "creator-fee",
        /// as the "creation-fee" will be split between "creator" and "platform".
        uint256 creationFeeRate_e18;

        uint32 tOpen;
        uint32 tClose;
        uint32 tResolve;
        uint8 nOutcomes;
        IERC20 paymentToken;
        VirtualFloorMetadata metadata;
    }

    /// @notice Create a new virtual-floor.
    /// @dev `virtualFloorId` must start 0x00 (1)
    /// Since the virtualFloorId is passed as an argument to all functions on this contract,
    /// choosing initially a `virtualFloorId` whose 32-byte representation contains many zeros
    /// will result in cheaper calls overall.
    /// Using a uint32 for this id will satisfy (1), and will also lower the cost of each call
    /// by (32 bytes - 8 bytes) * (16 gas/nonzerobyte - 4 gas/zerobtye) = 288 gas/call
    function createVirtualFloor(VirtualFloorCreationParams calldata params) external;

    function commitToVirtualFloor(uint256 virtualFloorId, uint8 outcomeIndex, uint256 amount) external;

    enum CommitmentBalanceTransferRejectionCause {
        /// @dev Prevent commitment-balance transfers if parent VF is not RunningOrClosed
        WrongState,
        /// @dev Prevent commitment-balance transfers from tResolve onwards,
        /// as we foresee no legitimate reason for such transfers.
        TooLate,
        /// @dev Once a VF has >= 2 outcomes, it is certain that come tClose,
        /// this VF will not have to be cancelled for being unconcludable.
        /// So we allow transfers from the moment the VF has >= 2 outcomes onwards,
        /// even prior to tClose.
        VirtualFloorUnconcludable
    }

    error CommitmentBalanceTransferRejection(uint256 id, CommitmentBalanceTransferRejectionCause cause);

    function cancelUnconcudableVirtualFloor(uint256 virtualFloorId) external;

    function resolve(uint256 virtualFloorId, uint8 outcomeIndex) external;

    function claim(VirtualFloorOutcomeTimeslot calldata context) external;

    function claimBatch(VirtualFloorOutcomeTimeslot[] calldata commitments) external;

    /// @notice The timeline is split into a number of non-overlapping consecutive timeslots of this duration.
    /// Token amounts committed to a specific outcome of a specific virtual-floor within a specific timeslot
    /// are only fungible between themselves.
    function TIMESLOT_DURATION() external view returns (uint256);


    event PlatformFeeRateUpdate(uint256 platformFeeRate_e18);

    function platformFeeRate_e18() external view returns (uint256);

    function setPlatformFeeRate_e18(uint256 platformFeeRate_e18) external;

    function platformFeeBeneficiary() external view returns (address);
}
