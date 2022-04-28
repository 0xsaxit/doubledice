// SPDX-License-Identifier: Unlicensed

pragma solidity 0.8.12;

import "../../../ChallengeableCreatorOracle.sol";

contract ResultUpdateActionWrapper {
    /* solhint-disable const-name-snakecase */
    ResultUpdateAction constant public OperatorFinalizedUnsetResult = ResultUpdateAction.OperatorFinalizedUnsetResult;
    ResultUpdateAction constant public CreatorSetResult = ResultUpdateAction.CreatorSetResult;
    ResultUpdateAction constant public SomeoneConfirmedUnchallengedResult = ResultUpdateAction.SomeoneConfirmedUnchallengedResult;
    ResultUpdateAction constant public SomeoneChallengedSetResult = ResultUpdateAction.SomeoneChallengedSetResult;
    ResultUpdateAction constant public OperatorFinalizedChallenge = ResultUpdateAction.OperatorFinalizedChallenge;
    /* solhint-enable const-name-snakecase */
}
