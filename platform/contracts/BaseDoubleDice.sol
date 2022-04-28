// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.12;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "./ForkedERC1155UpgradeableV4_5_2.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeCastUpgradeable.sol";

import "./library/ERC1155TokenIds.sol";
import "./library/FixedPointTypes.sol";
import "./library/Utils.sol";
import "./library/VirtualFloorCreationParamsUtils.sol";
import "./library/VirtualFloors.sol";
import "./ExtraStorageGap.sol";
import "./MultipleInheritanceOptimization.sol";


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
 * @title Base DoubleDice protocol contract
 * @author 🎲🎲 <dev@doubledice.com>
 * @notice Enables accounts to commit an amount of ERC-20 tokens to a prediction that a specific future event,
 * or VirtualFloor (VF), resolves to a specific outcome from a predefined list of 2 or more mutually-exclusive
 * possible outcomes.
 * Users committing funds to a specific VF outcome at a specific timepoint are issued with a commitment receipt
 * in the form of a ERC-1155 commitment-balance.
 * If a VF is resolved to a winning outcome and winner profits are available, the commitment-balance may be redeemed
 * by its holder for the corresponding share of the profit.
 */
abstract contract BaseDoubleDice is
    ForkedERC1155UpgradeableV4_5_2,
    AccessControlUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable,
    ExtraStorageGap,
    MultipleInheritanceOptimization
{
    using FixedPointTypes for UFixed16x4;
    using FixedPointTypes for UFixed256x18;
    using FixedPointTypes for UFixed32x6;
    using FixedPointTypes for uint256;
    using SafeCastUpgradeable for uint256;
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using Utils for uint256;
    using VirtualFloorCreationParamsUtils for VirtualFloorCreationParams;
    using ERC1155TokenIds for uint256;
    using VirtualFloors for VirtualFloor;


    // ----------🎲🎲 STORAGE 🎲🎲----------

    mapping(uint256 => VirtualFloor) private _vfs;

    address private _protocolFeeBeneficiary;

    UFixed16x4 private _protocolFeeRate;

    string private _contractURI;

    mapping(IERC20Upgradeable => bool) private _paymentTokenWhitelist;


    // ----------🎲🎲 GENERIC ERRORS & CONSTANTS 🎲🎲----------

    /**
     * @notice Caller is not authorized to execute this action.
     */
    error UnauthorizedMsgSender();

    /**
     * @notice VF is in state `actualState`, but it must be in a different state to execute this action.
     */
    error WrongVirtualFloorState(VirtualFloorState actualState);

    /**
     * @notice The action being attempted can only be executed from a specific timepoint onwards,
     * and that timepoint has not yet arrived.
     */
    error TooEarly();

    /**
     * @notice The action you are trying to execute can only be executed until a specific timepoint,
     * and that timepoint has passed.
     */
    error TooLate();

    /**
     * @notice The specified outcome index is too large for this VF.
     */
    error OutcomeIndexOutOfRange();


    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");


    // ----------🎲🎲 SETUP & CONFIG 🎲🎲----------


    // ----------🎲 Initial config 🎲----------

    struct BaseDoubleDiceInitParams {
        string tokenMetadataUriTemplate;
        address protocolFeeBeneficiary;
        UFixed256x18 protocolFeeRate_e18;
        string contractURI;
    }

    function __BaseDoubleDice_init(BaseDoubleDiceInitParams calldata params)
        internal
        onlyInitializing
        multipleInheritanceRootInitializer
    {
        __ERC1155_init(params.tokenMetadataUriTemplate);
        __AccessControl_init();
        __Pausable_init();
        __ReentrancyGuard_init();
        _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());
        _setProtocolFeeBeneficiary(params.protocolFeeBeneficiary);
        _setProtocolFeeRate(params.protocolFeeRate_e18);
        _setContractURI(params.contractURI);
    }


    // ----------🎲 Config: tokenMetadataUriTemplate 🎲----------

    /**
     * @notice Admin: Set tokenMetadataUriTemplate
     * @dev See https://eips.ethereum.org/EIPS/eip-1155#metadata
     */
    function setTokenMetadataUriTemplate(string calldata template) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setURI(template);
    }


    // ----------🎲 Config: protocolFeeBeneficiary 🎲----------

    /**
     * @notice Account to which protocol-fee is transferred
     * @custom:todo Rename to protocolFeeBeneficiary
     */
    function platformFeeBeneficiary() public view returns (address) {
        return _protocolFeeBeneficiary;
    }

    /**
     * @notice Admin: Set protocolFeeBeneficiary
     * @custom:todo Rename to setProtocolFeeBeneficiary
     */
    function setPlatformFeeBeneficiary(address protocolFeeBeneficiary_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setProtocolFeeBeneficiary(protocolFeeBeneficiary_);
    }

    /**
     * @custom:todo Rename to ProtocolFeeBeneficiaryUpdate
     */
    event PlatformFeeBeneficiaryUpdate(address protocolFeeBeneficiary);

    function _setProtocolFeeBeneficiary(address protocolFeeBeneficiary_) internal {
        emit OwnershipTransferred(_protocolFeeBeneficiary, protocolFeeBeneficiary_);
        _protocolFeeBeneficiary = protocolFeeBeneficiary_;
        emit PlatformFeeBeneficiaryUpdate(protocolFeeBeneficiary_);
    }


    // ----------🎲 Config: protocolFeeRate 🎲----------

    /**
     * @notice Protocol-fee rate that will apply to newly-created VFs.
     * E.g. 1.25% would be returned as 0.0125e18
     */
    function platformFeeRate_e18() external view returns (UFixed256x18) {
        return _protocolFeeRate.toUFixed256x18();
    }

    /**
     * @notice Admin: Set protocol-fee rate.
     * @param protocolFeeRate_e18_ The rate as a proportion, scaled by 1e18.
     * E.g. 1.25% or 0.0125 should be entered as 0_012500_000000_000000
     */
    function setPlatformFeeRate_e18(UFixed256x18 protocolFeeRate_e18_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setProtocolFeeRate(protocolFeeRate_e18_);
    }

    /**
     * @notice protocolFeeRate <= 1.0 not satisfied
     */
    error PlatformFeeRateTooLarge();

    event PlatformFeeRateUpdate(UFixed256x18 protocolFeeRate_e18);

    function _setProtocolFeeRate(UFixed256x18 protocolFeeRate) internal {
        if (!protocolFeeRate.lte(UFIXED256X18_ONE)) revert PlatformFeeRateTooLarge();
        _protocolFeeRate = protocolFeeRate.toUFixed16x4();
        emit PlatformFeeRateUpdate(protocolFeeRate);
    }


    // ----------🎲 Config: contractURI 🎲----------

    /**
     * @notice URL for the OpenSea storefront-level metadata for this contract
     * @dev See https://docs.opensea.io/docs/contract-level-metadata
     */
    function contractURI() external view returns (string memory) {
        return _contractURI;
    }

    /**
     * @notice Admin: Set contractURI
     */
    function setContractURI(string memory contractURI_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setContractURI(contractURI_);
    }

    event ContractURIUpdate(string contractURI);

    function _setContractURI(string memory contractURI_) internal {
        _contractURI = contractURI_;
        emit ContractURIUpdate(contractURI_);
    }


    // ----------🎲 Config: paymentTokenWhitelist 🎲----------

    /**
     * @notice Check whether a specific ERC-20 token can be set as a VF's payment-token during createVirtualFloor.
     */
    function isPaymentTokenWhitelisted(IERC20Upgradeable token) public view returns (bool) {
        return _paymentTokenWhitelist[token];
    }

    /**
     * @notice Admin: Update payment-token whitelist status. Has no effect on VFs already created with this token.
     */
    function updatePaymentTokenWhitelist(IERC20Upgradeable token, bool isWhitelisted) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _updatePaymentTokenWhitelist(token, isWhitelisted);
    }

    event PaymentTokenWhitelistUpdate(IERC20Upgradeable indexed token, bool whitelisted);

    function _updatePaymentTokenWhitelist(IERC20Upgradeable token, bool isWhitelisted) internal {
        _paymentTokenWhitelist[token] = isWhitelisted;
        emit PaymentTokenWhitelistUpdate(token, isWhitelisted);
    }


    // ----------🎲🎲 PUBLIC VIRTUAL-FLOOR GETTERS 🎲🎲----------

    /**
     * @notice Get state of VF with id `vfId`.
     */
    function getVirtualFloorState(uint256 vfId) public view returns (VirtualFloorState) {
        return _vfs[vfId].state();
    }

    /**
     * @notice Get account that created VF with id `vfId`.
     */
    function getVirtualFloorCreator(uint256 vfId) public view returns (address) {
        return _vfs[vfId].creator;
    }

    struct CreatedVirtualFloorParams {
        UFixed256x18 betaOpen_e18;
        UFixed256x18 totalFeeRate_e18;
        UFixed256x18 protocolFeeRate_e18;
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

    /**
     * @notice Get parameters of VF with id `vfId`.
     */
    function getVirtualFloorParams(uint256 vfId) public view returns (CreatedVirtualFloorParams memory) {
        VirtualFloor storage vf = _vfs[vfId];
        (uint256 minCommitmentAmount, uint256 maxCommitmentAmount) = vf.minMaxCommitmentAmounts();
        return CreatedVirtualFloorParams({
            betaOpen_e18: vf.betaOpenMinusBetaClose.toUFixed256x18().add(_BETA_CLOSE),
            totalFeeRate_e18: vf.totalFeeRate.toUFixed256x18(),
            protocolFeeRate_e18: vf.protocolFeeRate.toUFixed256x18(),
            tOpen: vf.tOpen,
            tClose: vf.tClose,
            tResolve: vf.tResolve,
            nOutcomes: vf.nOutcomes,
            paymentToken: vf.paymentToken,
            bonusAmount: vf.bonusAmount,
            minCommitmentAmount: minCommitmentAmount,
            maxCommitmentAmount: maxCommitmentAmount,
            creator: vf.creator
        });
    }

    /**
     * @notice Get total ERC-20 payment-token amount, as well as total weighted amount,
     * committed to outcome with 0-based index `outcomeIndex` of VF with id `vfId`.
     */
    function getVirtualFloorOutcomeTotals(uint256 vfId, uint8 outcomeIndex) public view returns (OutcomeTotals memory) {
        return _vfs[vfId].outcomeTotals[outcomeIndex];
    }


    // ----------🎲🎲 VIRTUAL-FLOOR LIFECYCLE 🎲🎲----------


    // ----------🎲 Lifecycle: Creating a VF 🎲----------

    /**
     * @notice A VF with the same id already exists.
     */
    error DuplicateVirtualFloorId();

    /**
     * @notice Trying to create a VF with a non-whitelisted ERC-20 payment-token.
     */
    error PaymentTokenNotWhitelisted();

    /**
     * @notice Condition `0 < minCommitmentAmount <= maxCommitmentAmount` not satisfied.
     */
    error InvalidMinMaxCommitmentAmounts();

    event VirtualFloorCreation(
        uint256 indexed vfId,
        address indexed creator,
        UFixed256x18 betaOpen_e18,
        UFixed256x18 totalFeeRate_e18,
        UFixed256x18 protocolFeeRate_e18,
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

    /**
     * @notice Create a VF with params `params`.
     */
    function createVirtualFloor(VirtualFloorCreationParams calldata params)
        public
        whenNotPaused
    {

        // Pure value validation
        params.validatePure();

        // Validation against block

        // CR-01: If block.timestamp is just a few seconds before tCreateMax,
        // manipulating block.timestamp by a few seconds to be > tCreateMax
        // would cause this transaction to fail,
        // and the creator would have to re-attempt the transaction.
        // solhint-disable-next-line not-rely-on-time
        if (!(block.timestamp <= params.tCreateMax())) revert TooLate();

        VirtualFloor storage vf = _vfs[params.vfId];

        // Validation against storage
        if (!(vf._internalState == VirtualFloorInternalState.None)) revert DuplicateVirtualFloorId();
        if (!isPaymentTokenWhitelisted(params.paymentToken)) revert PaymentTokenNotWhitelisted();

        vf._internalState = VirtualFloorInternalState.Active;
        vf.creator = _msgSender();
        vf.betaOpenMinusBetaClose = params.betaOpen_e18.sub(_BETA_CLOSE).toUFixed32x6();
        vf.totalFeeRate = params.totalFeeRate_e18.toUFixed16x4();
        vf.protocolFeeRate = _protocolFeeRate; // freeze current global protocolFeeRate
        vf.tOpen = params.tOpen;
        vf.tClose = params.tClose;
        vf.tResolve = params.tResolve;
        vf.nOutcomes = params.nOutcomes;
        vf.paymentToken = params.paymentToken;

        if (params.bonusAmount > 0) {
            vf.bonusAmount = params.bonusAmount;

            // For the purpose of knowing whether a VF is unresolvable,
            // the bonus amount is equivalent to a commitment to a "virtual" outcome
            // that never wins, but only serves the purpose of increasing the total
            // amount committed to the VF
            vf.nonzeroOutcomeCount += 1;

            // nonReentrant
            // Since createVirtualFloor is guarded by require(_internalState == None)
            // and _internalState has now been moved to Active,
            // the following external safeTransferFrom call cannot re-enter createVirtualFloor.
            params.paymentToken.safeTransferFrom(_msgSender(), address(this), params.bonusAmount);
        }

        uint256 min;
        uint256 max;
        {
            // First store raw values ...
            vf._optionalMinCommitmentAmount = params.optionalMinCommitmentAmount.toUint128();
            vf._optionalMaxCommitmentAmount = params.optionalMaxCommitmentAmount.toUint128();
            // ... then validate values returned through the library getter.
            (min, max) = vf.minMaxCommitmentAmounts();
            if (!(_MIN_POSSIBLE_COMMITMENT_AMOUNT <= min && min <= max && max <= _MAX_POSSIBLE_COMMITMENT_AMOUNT)) revert InvalidMinMaxCommitmentAmounts();
        }

        // Extracting this value to a local variable
        // averts a "Stack too deep" CompilerError in the
        // subsequent `emit`
        EncodedVirtualFloorMetadata calldata metadata = params.metadata;

        emit VirtualFloorCreation({
            vfId: params.vfId,
            creator: vf.creator,
            betaOpen_e18: params.betaOpen_e18,
            totalFeeRate_e18: params.totalFeeRate_e18,
            protocolFeeRate_e18: _protocolFeeRate.toUFixed256x18(),
            tOpen: params.tOpen,
            tClose: params.tClose,
            tResolve: params.tResolve,
            nOutcomes: params.nOutcomes,
            paymentToken: params.paymentToken,
            bonusAmount: params.bonusAmount,
            minCommitmentAmount: min,
            maxCommitmentAmount: max,
            metadata: metadata
        });

        // nonReentrant
        // Since createVirtualFloor is guarded by require(_internalState == None)
        // and _internalState has now been moved to Active,
        // any external calls made by _onVirtualFloorCreation cannot re-enter createVirtualFloor.
        //
        // Hooks might want to read VF values from storage, so hook-call must happen last.
        _onVirtualFloorCreation(params);
    }


    // ----------🎲 Lifecycle: Committing ERC-20 tokens to an Active VF's outcome and receiving ERC-1155 token balance in return 🎲----------

    /**
     * @notice Commitment transaction not mined within the specified deadline.
     */
    error CommitmentDeadlineExpired();

    /**
     * @notice minCommitmentAmount <= amount <= maxCommitmentAmount not satisfied.
     */
    error CommitmentAmountOutOfRange();

    event UserCommitment(
        uint256 indexed vfId,
        address indexed committer,
        uint8 outcomeIndex,
        uint256 timeslot,
        uint256 amount,
        UFixed256x18 beta_e18,
        uint256 tokenId
    );

    /**
     * @notice Commit a non-zero amount of payment-token to one of the VF's outcomes.
     * Calling account must have pre-approved the amount as spending allowance to this contract.
     * @param vfId Id of VF to which to commit.
     * @param outcomeIndex 0-based index of VF outcome to which to commit. Must be < nOutcomes.
     * @param amount Amount of ERC-20 payment-token vf.paymentToken to commit.
     * @param optionalDeadline Latest timestamp at which transaction can be mined. Pass 0 to not enforce a deadline.
     */
    function commitToVirtualFloor(uint256 vfId, uint8 outcomeIndex, uint256 amount, uint256 optionalDeadline)
        public
        whenNotPaused
        nonReentrant
    {
        // Note: if-condition is a minor gas optimization; it costs ~20 gas more to test the if-condition,
        // but if it deadline is left unspecified, it saves ~400 gas.
        if (optionalDeadline != 0) {
            // CR-01: To avoid a scenario where a commitment is mined so late that it might no longer favourable
            // to the committer to make that commitment, it is possible to specify the maximum time
            // until which the commitment may be mined.
            // solhint-disable-next-line not-rely-on-time
            if (!(block.timestamp <= optionalDeadline)) revert CommitmentDeadlineExpired();
        }

        VirtualFloor storage vf = _vfs[vfId];

        if (!vf.isOpen()) revert WrongVirtualFloorState(vf.state());

        if (!(outcomeIndex < vf.nOutcomes)) revert OutcomeIndexOutOfRange();

        (uint256 minAmount, uint256 maxAmount) = vf.minMaxCommitmentAmounts();
        if (!(minAmount <= amount && amount <= maxAmount)) revert CommitmentAmountOutOfRange();

        vf.paymentToken.safeTransferFrom(_msgSender(), address(this), amount);

        // Commitments made at t < tOpen will all be accumulated into the same timeslot == tOpen,
        // and will therefore be assigned the same beta == betaOpen.
        // This means that all commitments to a specific outcome that happen at t <= tOpen
        // will be minted as balances on the the same ERC-1155 tokenId, which means that
        // these balances will be exchangeable/tradeable/fungible between themselves,
        // but they will not be fungible with commitments to the same outcome that arrive later.
        //
        // CR-01: Manipulating block.timestamp to be a few seconds later would
        // result in a fractionally lower beta.
        // solhint-disable-next-line not-rely-on-time
        uint256 timeslot = MathUpgradeable.max(vf.tOpen, block.timestamp);

        UFixed256x18 beta_e18 = vf.betaOf(timeslot);
        OutcomeTotals storage outcomeTotals = vf.outcomeTotals[outcomeIndex];

        // Only increment this counter the first time an outcome is committed to.
        // In this way, this counter will be updated maximum nOutcome times over the entire commitment period.
        // Some gas could be saved here by marking as unchecked, and by not counting beyond 2,
        // but these micro-optimizations are forfeited to retain simplicity.
        if (outcomeTotals.amount == 0) {
            vf.nonzeroOutcomeCount += 1;
        }

        outcomeTotals.amount += amount;
        outcomeTotals.amountTimesBeta_e18 = outcomeTotals.amountTimesBeta_e18.add(beta_e18.mul0(amount));

        uint256 tokenId = ERC1155TokenIds.vfOutcomeTimeslotIdOf(vfId, outcomeIndex, timeslot);

        // It is useful to the Graph indexer for the commitment-parameters to have been bound to a particular tokenId
        // before that same tokenId is referenced in a transfer.
        // For this reason, the UserCommitment event is emitted before _mint emits TransferSingle.
        emit UserCommitment({
            vfId: vfId,
            committer: _msgSender(),
            outcomeIndex: outcomeIndex,
            timeslot: timeslot,
            amount: amount,
            beta_e18: beta_e18,
            tokenId: tokenId
        });
        _mint({
            to: _msgSender(),
            id: tokenId,
            amount: amount,
            data: hex""
        });
    }


    // ----------🎲 Lifecycle: Transferring commitment-balances held on an Active VF 🎲----------

    error CommitmentBalanceTransferWhilePaused();

    error CommitmentBalanceTransferRejection(uint256 id, VirtualFloorState state);

    /**
     * @dev Hook into ERC-1155 transfer process to allow commitment-balances to be transferred only if VF
     * in states `Active_Open_ResolvableLater` and `Active_Closed_ResolvableLater`.
     */
    function _beforeTokenTransfer(
        address /*operator*/,
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory /*amounts*/,
        bytes memory /*data*/
    )
        internal
        override
        virtual
    {
        // Skip empty "super._beforeTokenTransfer(operator, from, to, ids, amounts, data);"

        // No restrictions on mint/burn
        //        
        // EN-01: Since this hook is invoked routinely as part of the regular commit/claim process,
        // this check is performed before all other checks, even before checking paused(),
        // to avoid wasting gas on SLOADs or on other relatively expensive operations.
        if (from == address(0) || to == address(0)) {
            return;
        }

        if (paused()) revert CommitmentBalanceTransferWhilePaused();

        for (uint256 i = 0; i < ids.length; i++) {
            uint256 id = ids[i];
            VirtualFloorState state = _vfs[id.extractVirtualFloorId()].state();
            if (!(state == VirtualFloorState.Active_Open_ResolvableLater || state == VirtualFloorState.Active_Closed_ResolvableLater)) {
                revert CommitmentBalanceTransferRejection(id, state);
            }
        }
    }


    // ----------🎲 Lifecycle: Cancelling an Active VF that could never possibly be resolved 🎲----------

    event VirtualFloorCancellationUnresolvable(
        uint256 indexed vfId
    );

    /**
     * @notice A VF's commitment period closes at `tClose`. If at this point there are 0 commitments to 0 outcomes,
     * or there are > 0 commitments, but all to a single outcome, then this VF is considered *unresolvable*.
     * For such a VF:
     * 1. ERC-1155 commitment-balances on outcomes of this VF can no longer transferred.
     * 2. The only possible action for this VF is for *anyone* to invoke this function to cancel the VF.
     */
    function cancelVirtualFloorUnresolvable(uint256 vfId)
        public
        whenNotPaused
    {
        VirtualFloor storage vf = _vfs[vfId];
        VirtualFloorState state = vf.state();
        if (!(state == VirtualFloorState.Active_Closed_ResolvableNever)) revert WrongVirtualFloorState(state);
        vf._internalState = VirtualFloorInternalState.Claimable_Refunds_ResolvableNever;
        emit VirtualFloorCancellationUnresolvable(vfId);

        // nonReentrant
        // Since cancelVirtualFloorUnresolvable is guarded by require(_internalState == Active)
        // and _internalState has now been moved to Claimable_Refunds_ResolvableNever,
        // any external calls made from this point onwards cannot re-enter cancelVirtualFloorUnresolvable.

        vf.refundBonusAmount();

        _onVirtualFloorConclusion(vfId);
    }


    // ----------🎲 Lifecycle: Cancelling an Active VF that was flagged 🎲----------

    event VirtualFloorCancellationFlagged(
        uint256 indexed vfId,
        string reason
    );

    /**
     * @notice Operator: Cancel Active VF with id `vfId` that has been flagged for `reason`.
     */
    function cancelVirtualFloorFlagged(uint256 vfId, string calldata reason)
        public
        onlyRole(OPERATOR_ROLE)
    {
        VirtualFloor storage vf = _vfs[vfId];
        if (!(vf._internalState == VirtualFloorInternalState.Active)) revert WrongVirtualFloorState(vf.state());
        vf._internalState = VirtualFloorInternalState.Claimable_Refunds_Flagged;
        emit VirtualFloorCancellationFlagged(vfId, reason);

        // nonReentrant
        // Since cancelVirtualFloorFlagged is guarded by require(_internalState == Active)
        // and _internalState has now been moved to Claimable_Refunds_Flagged,
        // any external calls made from this point onwards cannot re-enter cancelVirtualFloorFlagged.

        vf.refundBonusAmount();

        _onVirtualFloorConclusion(vfId);
    }


    // ----------🎲 Lifecycle: Resolving a VF to the winning outcome 🎲----------

    error ResolveWhilePaused();

    enum VirtualFloorResolutionType {
        /**
         * @notice VF resolved to an outcome to which there were 0 commitments,
         * so the VF will be cancelled.
         */
        NoWinners,

        /**
         * @notice VF resolved to an outcome to which there were commitments,
         * so all commitments to that outcome will be able to claim payouts.
         */
        Winners
    }

    event VirtualFloorResolution(
        uint256 indexed vfId,
        uint8 winningOutcomeIndex,
        VirtualFloorResolutionType resolutionType,
        uint256 winnerProfits,
        uint256 protocolFeeAmount,
        uint256 creatorFeeAmount
    );

    /**
     * @dev This base function only requires that the VF is in the correct state to be resolved,
     * but it is up to the extending contract to decide how to restrict further the conditions under which VF is resolved,
     * e.g. through a consensus mechanism, or via integration with an external oracle.
     */
    function _resolve(uint256 vfId, uint8 winningOutcomeIndex, address creatorFeeBeneficiary) internal {
        if (paused()) revert ResolveWhilePaused();

        VirtualFloor storage vf = _vfs[vfId];

        VirtualFloorState state = vf.state();
        if (!(state == VirtualFloorState.Active_Closed_ResolvableNow)) revert WrongVirtualFloorState(state);

        if (!(winningOutcomeIndex < vf.nOutcomes)) revert OutcomeIndexOutOfRange();

        vf.winningOutcomeIndex = winningOutcomeIndex;

        uint256 totalCommitmentsToAllOutcomesPlusBonus = vf.totalCommitmentsToAllOutcomesPlusBonus();
        uint256 totalCommitmentsToWinningOutcome = vf.outcomeTotals[winningOutcomeIndex].amount;

        // If all funds under this VF were to be under a single outcome,
        // then nonzeroOutcomeCount would be == 1 and
        // the VF would not be in state Active_Closed_ResolvableNow.
        // Therefore the following assertion should never fail.
        assert(totalCommitmentsToWinningOutcome != totalCommitmentsToAllOutcomesPlusBonus);

        VirtualFloorResolutionType resolutionType;
        uint256 protocolFeeAmount;
        uint256 creatorFeeAmount;
        uint256 totalWinnerProfits;

        if (totalCommitmentsToWinningOutcome == 0) {
            // This could happen if e.g. there are commitments to outcome #0 and outcome #1,
            // but not to outcome #2, and #2 is the winner.
            // In this case, the current ERC-1155 commitment-balance owner becomes eligible
            // to reclaim the equivalent original ERC-20 token amount,
            // i.e. to withdraw the current ERC-1155 balance amount as ERC-20 tokens.
            // Neither the creator nor the protocol apply any fees in this circumstance.
            vf._internalState = VirtualFloorInternalState.Claimable_Refunds_ResolvedNoWinners;
            resolutionType = VirtualFloorResolutionType.NoWinners;
            protocolFeeAmount = 0;
            creatorFeeAmount = 0;
            totalWinnerProfits = 0;

            vf.refundBonusAmount();
        } else {
            vf._internalState = VirtualFloorInternalState.Claimable_Payouts;
            resolutionType = VirtualFloorResolutionType.Winners;

            // Winner commitments refunded, fee applied, then remainder split between winners proportionally by `commitment * beta`.
            uint256 maxTotalFeeAmount = vf.totalFeeRate.toUFixed256x18().mul0(totalCommitmentsToAllOutcomesPlusBonus).floorToUint256();

            // If needs be, limit the fee to ensure that there enough funds to be able to refund winner commitments in full.
            uint256 totalFeePlusTotalWinnerProfits = totalCommitmentsToAllOutcomesPlusBonus - totalCommitmentsToWinningOutcome;

            uint256 totalFeeAmount = MathUpgradeable.min(maxTotalFeeAmount, totalFeePlusTotalWinnerProfits);

            unchecked { // because b - min(a, b) >= 0
                totalWinnerProfits = totalFeePlusTotalWinnerProfits - totalFeeAmount;
            }
            vf.winnerProfits = totalWinnerProfits.toUint192();

            // Since protocolFeeRate <= 1.0, protocolFeeAmount will always be <= totalFeeAmount...
            protocolFeeAmount = vf.protocolFeeRate.toUFixed256x18().mul0(totalFeeAmount).floorToUint256();
            vf.paymentToken.safeTransfer(_protocolFeeBeneficiary, protocolFeeAmount);

            unchecked { // ... so this subtraction will never underflow.
                creatorFeeAmount = totalFeeAmount - protocolFeeAmount;
            }

            vf.paymentToken.safeTransfer(creatorFeeBeneficiary, creatorFeeAmount);
        }

        emit VirtualFloorResolution({
            vfId: vfId,
            winningOutcomeIndex: winningOutcomeIndex,
            resolutionType: resolutionType,
            winnerProfits: totalWinnerProfits,
            protocolFeeAmount: protocolFeeAmount,
            creatorFeeAmount: creatorFeeAmount
        });

        _onVirtualFloorConclusion(vfId);
    }


    // ----------🎲 Lifecycle: Claiming ERC-20 payouts/refunds for commitment-balance held on a Claimable VF 🎲----------

    /**
     * @notice Token id `tokenId` does not match the specified VF id
     */
    error MismatchedVirtualFloorId(uint256 tokenId);

    /**
     * @notice For a VF that has been cancelled,
     * claim the original ERC-20 commitments corresponding to the ERC-1155 balances
     * held by the calling account on the specified `tokenIds`.
     * @param vfId The VF id. This VF must be in one of the Claimable_Refunds states.
     * @param tokenIds The ERC-1155 token-ids for which to claim refunds.
     * If a tokenId is included multiple times, it will count only once.
     */
    function claimRefunds(uint256 vfId, uint256[] calldata tokenIds)
        public
        whenNotPaused
    {
        VirtualFloor storage vf = _vfs[vfId];
        if (!vf.isClaimableRefunds()) revert WrongVirtualFloorState(vf.state());
        address msgSender = _msgSender();
        uint256 totalPayout = 0;
        uint256[] memory amounts = new uint256[](tokenIds.length);
        for (uint256 i = 0; i < tokenIds.length; i++) {
            uint256 tokenId = tokenIds[i];
            (uint256 extractedVfId, /*outcomeIndex*/, /*timeslot*/) = tokenId.destructure();
            if (!(extractedVfId == vfId)) revert MismatchedVirtualFloorId(tokenId);
            uint256 amount = _balances[tokenId][msgSender];
            amounts[i] = amount;
            if (amount > 0) {
                _balances[tokenId][msgSender] = 0;
                totalPayout += amount;
            }
        }
        emit TransferBatch(msgSender, msgSender, address(0), tokenIds, amounts);

        // nonReentrant
        // Since at this point in claimRefunds the ERC-1155 balances have already been burned,
        // the following external safeTransfer call cannot re-enter claimRefunds and re-claim.
        vf.paymentToken.safeTransfer(msgSender, totalPayout);
    }

    /**
     * @notice For a VF that has been resolved with winners and winner-profits,
     * claim the share of the total ERC-20 winner-profits corresponding to the ERC-1155 balances
     * held by the calling account on the specified `tokenIds`.
     * If a tokenId is included multiple times, it will count only once.
     * @param vfId The VF id. This VF must be in the Claimable_Payouts state.
     * @param tokenIds The ERC-1155 token-ids for which to claim payouts.
     * If a tokenId is included multiple times, it will count only once.
     */
    function claimPayouts(uint256 vfId, uint256[] calldata tokenIds)
        public
        whenNotPaused
    {
        VirtualFloor storage vf = _vfs[vfId];
        {
            VirtualFloorState state = vf.state();
            if (!(state == VirtualFloorState.Claimable_Payouts)) revert WrongVirtualFloorState(state);
        }
        address msgSender = _msgSender();
        uint256 totalPayout = 0;
        uint256[] memory amounts = new uint256[](tokenIds.length);
        uint8 winningOutcomeIndex = vf.winningOutcomeIndex;
        UFixed256x18 winningOutcomeTotalAmountTimesBeta = vf.outcomeTotals[winningOutcomeIndex].amountTimesBeta_e18;
        uint256 totalWinnerProfits = vf.winnerProfits;
        for (uint256 i = 0; i < tokenIds.length; i++) {
            uint256 tokenId = tokenIds[i];
            (uint256 extractedVfId, uint8 outcomeIndex, uint32 timeslot) = tokenId.destructure();
            if (!(extractedVfId == vfId)) revert MismatchedVirtualFloorId(tokenId);
            uint256 amount = _balances[tokenId][msgSender];
            amounts[i] = amount;
            _balances[tokenId][msgSender] = 0;
            if (outcomeIndex == winningOutcomeIndex) {
                UFixed256x18 beta = vf.betaOf(timeslot);
                UFixed256x18 amountTimesBeta = beta.mul0(amount);
                uint256 profit = amountTimesBeta.mul0(totalWinnerProfits).divToUint256(winningOutcomeTotalAmountTimesBeta);
                totalPayout += amount + profit;
            }
        }
        emit TransferBatch(msgSender, msgSender, address(0), tokenIds, amounts);

        // nonReentrant
        // Since at this point in claimPayouts the ERC-1155 balances have already been burned,
        // the following external safeTransfer call cannot re-enter claimPayouts and re-claim.
        vf.paymentToken.safeTransfer(msgSender, totalPayout);
    }


    // ----------🎲 Lifecycle: Overrideable VF lifecycle hooks 🎲----------

    // solhint-disable-next-line no-empty-blocks
    function _onVirtualFloorCreation(VirtualFloorCreationParams calldata params) internal virtual {
    }

    // solhint-disable-next-line no-empty-blocks
    function _onVirtualFloorConclusion(uint256 vfId) internal virtual {
    }


    // ----------🎲🎲 FURTHER INTEROPERABILITY 🎲🎲----------


    // ----------🎲 Pausable 🎲----------

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }


    // ----------🎲 Ownable 🎲----------

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    /**
     * @notice Does not control anything on the contract, but simply exposes the protocolFeeBeneficiary as the `Ownable.owner()`
     * to enable this contract to interface with 3rd-party tools.
     */
    function owner() external view returns (address) {
        return _protocolFeeBeneficiary;
    }


    // ----------🎲 ERC-165 🎲----------

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ForkedERC1155UpgradeableV4_5_2, AccessControlUpgradeable)
        virtual
        returns (bool)
    {
        return ForkedERC1155UpgradeableV4_5_2.supportsInterface(interfaceId) || AccessControlUpgradeable.supportsInterface(interfaceId);
    }


    /**
     * @dev See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[50] private __gap;

}
