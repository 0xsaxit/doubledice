/* eslint-disable indent */
// Note: Despite the .ts file extension, this is AssemblyScript not TypeScript!

import { ResultUpdateAction } from '../../lib/helpers/sol-enums';

// Manually mirrored from schema.graphql
const ResultUpdateAction__AdminFinalizedUnsetResult = 'AdminFinalizedUnsetResult';
const ResultUpdateAction__CreatorSetResult = 'CreatorSetResult';
const ResultUpdateAction__SomeoneConfirmedUnchallengedResult = 'SomeoneConfirmedUnchallengedResult';
const ResultUpdateAction__SomeoneChallengedSetResult = 'SomeoneChallengedSetResult';
const ResultUpdateAction__AdminFinalizedChallenge = 'AdminFinalizedChallenge';

export function resultUpdateActionOrdinalToEnum(ordinal: i32): ResultUpdateAction {
  switch (ordinal) {
    case ResultUpdateAction.AdminFinalizedUnsetResult:
      return ResultUpdateAction.AdminFinalizedUnsetResult;
    case ResultUpdateAction.CreatorSetResult:
      return ResultUpdateAction.CreatorSetResult;
    case ResultUpdateAction.SomeoneConfirmedUnchallengedResult:
      return ResultUpdateAction.SomeoneConfirmedUnchallengedResult;
    case ResultUpdateAction.SomeoneChallengedSetResult:
      return ResultUpdateAction.SomeoneChallengedSetResult;
    case ResultUpdateAction.AdminFinalizedChallenge:
      return ResultUpdateAction.AdminFinalizedChallenge;
    default:
      assert(false, `Unexpected ResultUpdateEvent.action == ${ordinal}`);
      throw new Error('To avoid "Function lacks ending return statement and return type does not include \'undefined\'.ts(2366)"');
  }

}

export function resultUpdateActionEnumToString(action: ResultUpdateAction): string {
  switch (action) {
    case ResultUpdateAction.AdminFinalizedUnsetResult:
      return ResultUpdateAction__AdminFinalizedUnsetResult;
    case ResultUpdateAction.CreatorSetResult:
      return ResultUpdateAction__CreatorSetResult;
    case ResultUpdateAction.SomeoneConfirmedUnchallengedResult:
      return ResultUpdateAction__SomeoneConfirmedUnchallengedResult;
    case ResultUpdateAction.SomeoneChallengedSetResult:
      return ResultUpdateAction__SomeoneChallengedSetResult;
    case ResultUpdateAction.AdminFinalizedChallenge:
      return ResultUpdateAction__AdminFinalizedChallenge;
    default:
      throw new Error('To avoid "ERROR TS2355: A function whose declared type is not \'void\' must return a value."');
  }
}
