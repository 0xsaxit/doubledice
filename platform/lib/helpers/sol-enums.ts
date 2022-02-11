export enum VirtualFloorState {
  None,
  RunningOrClosed,
  ResolvedWinners,
  CancelledUnresolvable,
  CancelledResolvedNoWinners,
  CancelledFlagged
}

export enum VirtualFloorResolutionType {
  CancelledNoWinners,
  Winners
}

export enum VirtualFloorComputedState {
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

export enum CommitmentBalanceTransferRejectionCause {
  WrongState,
  TooLate,
  VirtualFloorUnresolvable
}
