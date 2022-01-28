# Virtual-floor state diagrams

## Contract

```mermaid
stateDiagram-v2
    [*] --> None
    None --> Running: createVirtualFloor
    Running --> Closed: block.timestamp ≥ tClosed
    Closed --> Completed: resolve(SomeWinners)
    Closed --> Cancelled: resolve(NoWinners)
    Closed --> Cancelled: resolve(AllWinners)
    Completed --> [*]
    Cancelled --> [*]
```

Note that on the contract:

- `Running` is represented by `state == RunningOrClosed && block.timestamp < tClosed`
- `Closed` is represented by `state == RunningOrClosed && block.timestamp ≥ tClosed`

## Graph

```mermaid
stateDiagram-v2
    [*] --> RUNNING_OR_CLOSED: VirtualFloorCreation
    RUNNING_OR_CLOSED --> COMPLETED: VirtualFloorResolution(SomeWinners)
    RUNNING_OR_CLOSED --> CANCELLED_BECAUSE_NO_WINNERS: VirtualFloorResolution(NoWinners)
    RUNNING_OR_CLOSED --> CANCELLED_BECAUSE_ALL_WINNERS: VirtualFloorResolution(AllWinners)
    COMPLETED --> [*]
    CANCELLED_BECAUSE_NO_WINNERS --> [*]
    CANCELLED_BECAUSE_ALL_WINNERS --> [*]
```
