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
