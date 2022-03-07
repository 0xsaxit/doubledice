// This file doubles as a TypeScript and as an AssemblyScript file

export enum VirtualFloorResolutionType {
  CancelledNoWinners,
  Winners
}

export enum VirtualFloorState {
  None,
  Active_Open_MaybeResolvableNever, // formerly Running
  Active_Open_ResolvableLater,      // formerly Running
  Active_Closed_ResolvableNever,    // formerly ClosedUnresolvable
  Active_Closed_ResolvableLater,    // formerly ClosedPreResolvable
  Active_Closed_ResolvableNow,      // formerly ClosedResolvable
  Claimable_Payouts,                // formerly ResolvedWinners
  Claimable_Refunds                 // formerly CancelledResolvedNoWinners | CancelledUnresolvable | CancelledFlagged
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
