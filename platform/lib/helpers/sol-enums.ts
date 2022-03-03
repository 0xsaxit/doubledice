// This file doubles as a TypeScript and as an AssemblyScript file

export enum VirtualFloorResolutionType {
  CancelledNoWinners,
  Winners
}

export enum VirtualFloorState {
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

export enum ResultUpdateAction {
  AdminFinalizedUnsetResult,
  CreatorSetResult,
  SomeoneConfirmedUnchallengedResult,
  SomeoneChallengedSetResult,
  AdminFinalizedChallenge
}

export enum ResolutionState {
  None,
  Set,
  Challenged,
  ChallengeCancelled,
  Complete
}
