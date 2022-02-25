export enum VirtualFloorInternalState {
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

export enum CommitmentBalanceTransferRejectionCause {
  WrongState,
  TooLate,
  VirtualFloorUnresolvable
}
