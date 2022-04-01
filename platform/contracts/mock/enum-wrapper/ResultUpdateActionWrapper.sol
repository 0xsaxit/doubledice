// SPDX-License-Identifier: Unlicensed

pragma solidity 0.8.12;

import "../../ChallengeableCreatorOracle.sol";

contract ResultUpdateActionWrapper {
    /* solhint-disable const-name-snakecase */
    ResultUpdateAction constant public AdminFinalizedUnsetResult = ResultUpdateAction.AdminFinalizedUnsetResult;
    ResultUpdateAction constant public CreatorSetResult = ResultUpdateAction.CreatorSetResult;
    ResultUpdateAction constant public SomeoneConfirmedUnchallengedResult = ResultUpdateAction.SomeoneConfirmedUnchallengedResult;
    ResultUpdateAction constant public SomeoneChallengedSetResult = ResultUpdateAction.SomeoneChallengedSetResult;
    ResultUpdateAction constant public AdminFinalizedChallenge = ResultUpdateAction.AdminFinalizedChallenge;
    /* solhint-enable const-name-snakecase */
}
