// SPDX-License-Identifier: Unlicensed

pragma solidity 0.8.12;

import "../../../ChallengeableCreatorOracle.sol";

contract ResultUpdateActionWrapper {
    /* solhint-disable const-name-snakecase */
    ChallengeableCreatorOracle.ResultUpdateAction constant public OperatorFinalizedUnsetResult = ChallengeableCreatorOracle.ResultUpdateAction.OperatorFinalizedUnsetResult;
    ChallengeableCreatorOracle.ResultUpdateAction constant public CreatorSetResult = ChallengeableCreatorOracle.ResultUpdateAction.CreatorSetResult;
    ChallengeableCreatorOracle.ResultUpdateAction constant public SomeoneConfirmedUnchallengedResult = ChallengeableCreatorOracle.ResultUpdateAction.SomeoneConfirmedUnchallengedResult;
    ChallengeableCreatorOracle.ResultUpdateAction constant public SomeoneChallengedSetResult = ChallengeableCreatorOracle.ResultUpdateAction.SomeoneChallengedSetResult;
    ChallengeableCreatorOracle.ResultUpdateAction constant public OperatorFinalizedChallenge = ChallengeableCreatorOracle.ResultUpdateAction.OperatorFinalizedChallenge;
    /* solhint-enable const-name-snakecase */
}
