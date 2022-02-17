// SPDX-License-Identifier: Unlicensed
pragma solidity 0.8.12;

import "@openzeppelin/contracts-upgradeable/access/IAccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/extensions/IERC1155MetadataURIUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

import "./FixedPointTypes.sol";
import "./VirtualFloorMetadata.sol";

struct VirtualFloorOutcomeTimeslot {
    uint256 virtualFloorId;
    uint8 outcomeIndex;
    uint256 timeslot;
}

struct VirtualFloorCreationParams {
    uint256 virtualFloorId;
    UFixed256x18 betaOpen_e18;

    /// @dev Purposely called "creation-fee" not "creator-fee",
    /// as the "creation-fee" will be split between "creator" and "platform".
    UFixed256x18 creationFeeRate_e18;

    uint32 tOpen;
    uint32 tClose;
    uint32 tResolve;
    uint8 nOutcomes;
    IERC20Upgradeable paymentToken;
    VirtualFloorMetadata metadata;
}

struct VirtualFloorParams {
    UFixed256x18 betaOpen_e18;
    UFixed256x18 creationFeeRate_e18;
    UFixed256x18 platformFeeRate_e18;
    uint32 tOpen;
    uint32 tClose;
    uint32 tResolve;
    uint8 nOutcomes;
    IERC20Upgradeable paymentToken;
    address owner;
}

enum VirtualFloorComputedState {
    None,
    Running,
    ClosedUnresolvable,
    ClosedPreResolvable,
    ClosedResolvable,
    ResolvedWinners,
    CancelledResolvedNoWinners,
    CancelledUnresolvable,
    CancelledFlagged
}

enum VirtualFloorResolutionType { CancelledNoWinners, Winners }

enum CommitmentBalanceTransferRejectionCause {
    /// @dev Prevent commitment-balance transfers if parent VF is not RunningOrClosed
    WrongState,
    /// @dev Prevent commitment-balance transfers from tResolve onwards,
    /// as we foresee no legitimate reason for such transfers.
    TooLate,
    /// @dev Once a VF has >= 2 outcomes, it is certain that come tClose,
    /// this VF will not have to be cancelled for being unresolvable.
    /// So we allow transfers from the moment the VF has >= 2 outcomes onwards,
    /// even prior to tClose.
    VirtualFloorUnresolvable
}

interface IDoubleDice is
    IAccessControlUpgradeable,
    IERC1155MetadataURIUpgradeable
{
    event VirtualFloorCreation(
        uint256 indexed virtualFloorId,
        address indexed creator,
        UFixed256x18 betaOpen_e18,
        UFixed256x18 creationFeeRate_e18,
        UFixed256x18 platformFeeRate_e18,
        uint32 tOpen,
        uint32 tClose,
        uint32 tResolve,
        uint8 nOutcomes,
        IERC20Upgradeable paymentToken,
        VirtualFloorMetadata metadata
    );

    event UserCommitment(
        uint256 indexed virtualFloorId,
        address indexed committer,
        uint8 outcomeIndex,
        uint256 timeslot,
        uint256 amount,
        UFixed256x18 beta_e18,
        uint256 tokenId
    );

    event VirtualFloorCancellationUnresolvable(
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

    /// @notice Create a new virtual-floor.
    /// @dev `virtualFloorId` must start 0x00 (1)
    /// Since the virtualFloorId is passed as an argument to all functions on this contract,
    /// choosing initially a `virtualFloorId` whose 32-byte representation contains many zeros
    /// will result in cheaper calls overall.
    /// Using a uint32 for this id will satisfy (1), and will also lower the cost of each call
    /// by (32 bytes - 8 bytes) * (16 gas/nonzerobyte - 4 gas/zerobtye) = 288 gas/call
    function createVirtualFloor(VirtualFloorCreationParams calldata params) external;

    function commitToVirtualFloor(uint256 virtualFloorId, uint8 outcomeIndex, uint256 amount) external;

    error CommitmentBalanceTransferRejection(uint256 id, CommitmentBalanceTransferRejectionCause cause);

    function cancelVirtualFloorUnresolvable(uint256 virtualFloorId) external;

    function resolve(uint256 virtualFloorId, uint8 outcomeIndex) external;

    function claim(VirtualFloorOutcomeTimeslot calldata context) external;

    function claimBatch(VirtualFloorOutcomeTimeslot[] calldata commitments) external;

    /// @notice The timeline is split into a number of non-overlapping consecutive timeslots of this duration.
    /// Token amounts committed to a specific outcome of a specific virtual-floor within a specific timeslot
    /// are only fungible between themselves.
    function TIMESLOT_DURATION() external view returns (uint256);


    function platformFeeRate_e18() external view returns (UFixed256x18);

    function platformFeeBeneficiary() external view returns (address);

    function getVirtualFloorOwner(uint256 virtualFloorId) external view returns (address);

    function getVirtualFloorParams(uint256 virtualFloorId) external view returns (VirtualFloorParams memory);

    function getVirtualFloorComputedState(uint256 virtualFloorId) external view returns (VirtualFloorComputedState);


    function isPaymentTokenWhitelisted(IERC20Upgradeable token) external view returns (bool);

}
