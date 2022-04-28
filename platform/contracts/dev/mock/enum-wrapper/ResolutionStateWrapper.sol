// SPDX-License-Identifier: Unlicensed

pragma solidity 0.8.12;

import "../../../ChallengeableCreatorOracle.sol";

contract ResolutionStateWrapper {
    /* solhint-disable const-name-snakecase */
    ChallengeableCreatorOracle.ResolutionState constant public None = ChallengeableCreatorOracle.ResolutionState.None;
    ChallengeableCreatorOracle.ResolutionState constant public Set = ChallengeableCreatorOracle.ResolutionState.Set;
    ChallengeableCreatorOracle.ResolutionState constant public Challenged = ChallengeableCreatorOracle.ResolutionState.Challenged;
    ChallengeableCreatorOracle.ResolutionState constant public ChallengeCancelled = ChallengeableCreatorOracle.ResolutionState.ChallengeCancelled;
    ChallengeableCreatorOracle.ResolutionState constant public Complete = ChallengeableCreatorOracle.ResolutionState.Complete;
    /* solhint-enable const-name-snakecase */
}
