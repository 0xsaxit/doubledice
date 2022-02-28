# Virtual-floor state diagrams

## Contract

```mermaid
stateDiagram-v2
    [*] --> None
    None --> Running: createVirtualFloor
    Running --> Closed: block.timestamp ≥ tClosed
    Closed --> ResolvedWinners: resolve(SomeWinners)
    Closed --> CancelledResolvedNoWinners: resolve(NoWinners)
    Closed --> CancelledUnresolvable: cancelUnresolvable
    Running --> CancelledFlagged: cancelFlagged
    Closed --> CancelledFlagged: cancelFlagged
    ResolvedWinners --> [*]
    CancelledResolvedNoWinners --> [*]
    CancelledUnresolvable --> [*]
    CancelledFlagged --> [*]
```

Note that on the contract:

- `Running` is represented by `state == RunningOrClosed && block.timestamp < tClosed`
- `Closed` is represented by `state == RunningOrClosed && block.timestamp ≥ tClosed`

## Graph

```mermaid
stateDiagram-v2
    [*] --> RUNNING_OR_CLOSED: VirtualFloorCreation
    RUNNING_OR_CLOSED --> RESOLVED_WINNERS: VirtualFloorResolution(SomeWinners)
    RUNNING_OR_CLOSED --> CANCELLED_BECAUSE_RESOLVED_NO_WINNERS: VirtualFloorResolution(NoWinners)
    RUNNING_OR_CLOSED --> CANCELLED_BECAUSE_UNRESOLVABLE: VirtualFloorCancellation
    RESOLVED_WINNERS --> [*]
    CANCELLED_BECAUSE_RESOLVED_NO_WINNERS --> [*]
    CANCELLED_BECAUSE_UNRESOLVABLE --> [*]
```
