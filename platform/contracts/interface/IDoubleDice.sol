// SPDX-License-Identifier: Unlicensed
pragma solidity 0.8.12;

import "@openzeppelin/contracts-upgradeable/access/IAccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/extensions/IERC1155MetadataURIUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

import "../library/FixedPointTypes.sol";

uint256 constant UNSPECIFIED_ZERO = 0;

/// @notice The version defines how to interpret the data.
/// In v1 the data could be abi-encoded, in v2 it could be JSON-encoded,
/// and in v3 the data could be just a sha256 hash of the content.
/// In v4 it could contain a server-signature.
/// It doesn't matter.
struct EncodedVirtualFloorMetadata {
    bytes32 version;
    bytes data;
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

    uint256 bonusAmount;

    /// @notice Leave unspecified by passing value 0
    uint256 optionalMinCommitmentAmount;

    /// @notice Leave unspecified by passing value 0
    uint256 optionalMaxCommitmentAmount;

    EncodedVirtualFloorMetadata metadata;
}

struct CreatedVirtualFloorParams {
    UFixed256x18 betaOpen_e18;
    UFixed256x18 creationFeeRate_e18;
    UFixed256x18 platformFeeRate_e18;
    uint32 tOpen;
    uint32 tClose;
    uint32 tResolve;
    uint8 nOutcomes;
    IERC20Upgradeable paymentToken;
    uint256 bonusAmount;
    uint256 minCommitmentAmount;
    uint256 maxCommitmentAmount;
    address creator;
}

enum VirtualFloorState {
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


error UnauthorizedMsgSender();

error WrongVirtualFloorState(VirtualFloorState actualState);

error TooEarly();

error TooLate();

/// @notice platformFeeRate <= 1.0 not satisfied
error PlatformFeeRateTooLarge();

/// @notice Trying to create a VF with a non-whitelisted ERC-20 payment-token
error PaymentTokenNotWhitelisted();

/// @notice A VF id's lower 5 bytes must be 0x00_00_00_00_00
error InvalidVirtualFloorId();

/// @notice betaOpen >= 1.0 not satisfied
error BetaOpenTooSmall();

/// @notice creationFeeRate <= 1.0 not satisfied
error CreationFeeRateTooLarge();

/// @notice VF timeline does not satisfy relation tOpen < tClose <= tResolve
error InvalidTimeline();

/// @notice _MIN_POSSIBLE <= min <= max <= _MAX_POSSIBLE not satisfied
error InvalidMinMaxCommitmentAmounts();

/// @notice nOutcomes >= 2 not satisfied
error NotEnoughOutcomes();

/// @notice outcomeIndex < nOutcomes not satisfied
error OutcomeIndexOutOfRange();

/// @notice minCommitmentAmount <= amount <= maxCommitmentAmount not satisfied
error CommitmentAmountOutOfRange();

error CommitmentBalanceTransferRejection(uint256 id, VirtualFloorState state);

/// @notice One of the token ids passed to a claim does not correspond to the passed virtualFloorId
error MismatchedVirtualFloorId(uint256 tokenId);


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
        uint256 bonusAmount,
        uint256 minCommitmentAmount,
        uint256 maxCommitmentAmount,
        EncodedVirtualFloorMetadata metadata
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

    event VirtualFloorCancellationFlagged(
        uint256 indexed virtualFloorId,
        string reason
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
        uint256 creatorFeeAmount
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

    function cancelVirtualFloorFlagged(uint256 virtualFloorId, string calldata reason) external;

    function cancelVirtualFloorUnresolvable(uint256 virtualFloorId) external;


    function claimRefunds(uint256 vfId, uint256[] calldata tokenIds) external;

    function claimPayouts(uint256 vfId, uint256[] calldata tokenIds) external;


    /// @notice The timeline is split into a number of non-overlapping consecutive timeslots of this duration.
    /// Token amounts committed to a specific outcome of a specific virtual-floor within a specific timeslot
    /// are only fungible between themselves.
    function TIMESLOT_DURATION() external view returns (uint256);


    function platformFeeRate_e18() external view returns (UFixed256x18);

    function platformFeeBeneficiary() external view returns (address);

    function getVirtualFloorCreator(uint256 virtualFloorId) external view returns (address);

    function getVirtualFloorParams(uint256 virtualFloorId) external view returns (CreatedVirtualFloorParams memory);

    function getVirtualFloorState(uint256 virtualFloorId) external view returns (VirtualFloorState);


    function isPaymentTokenWhitelisted(IERC20Upgradeable token) external view returns (bool);


    // ---------- Admin functions ----------

    event PlatformFeeBeneficiaryUpdate(address platformFeeBeneficiary);

    function setPlatformFeeBeneficiary(address platformFeeBeneficiary) external;

    event PlatformFeeRateUpdate(UFixed256x18 platformFeeRate_e18);

    function setPlatformFeeRate_e18(UFixed256x18 platformFeeRate_e18) external;

    event PaymentTokenWhitelistUpdate(IERC20Upgradeable indexed token, bool whitelisted);

    function updatePaymentTokenWhitelist(IERC20Upgradeable token, bool isWhitelisted) external;
}
