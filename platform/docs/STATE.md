# Virtual-floor state diagrams

## On-chain `VirtualFloor.internalState` stored value

```mermaid
stateDiagram-v2
    state resolutionType <<choice>>

    [*] --> None

    None --> RunningOrClosed: createVirtualFloor

    RunningOrClosed --> CancelledFlagged: cancelFlagged\n🔒 platformAdmin\n⏲️ any time

    RunningOrClosed --> CancelledUnresolvable: cancelUnresolvable\n🔓 anyone\n⏲️ tClose ≤ t\nhas commits to < 2 outcomes

    RunningOrClosed --> resolutionType: _resolve(f)\n🔒 internal\n⏲️ tResolve ≤ t\nhas commits to ≥ 2 outcomes
    resolutionType --> CancelledResolvedNoWinners: CancelledNoWinners
    resolutionType --> ResolvedWinners: Winners

    CancelledFlagged --> [*]
    CancelledUnresolvable --> [*]
    CancelledResolvedNoWinners --> [*]
    ResolvedWinners --> [*]
```


## On-chain `getVirtualFloorState()` return-value

ResolvableNever
ResolvableLater
ResolvableNow



```mermaid
stateDiagram-v2
    state resolutionType <<choice>>
    [*] --> None

    None --> Active_Open_MaybeResolvableNever: createVirtualFloor()

    Active_* --> Claimable_Refunds: cancelFlagged()

    Active_Open_MaybeResolvableNever --> Active_Open_ResolvableLater: commit() to ≥ 2 outcomes

    Active_Open_MaybeResolvableNever --> Active_Closed_ResolvableNever: t ≥ tClose
    Active_Open_ResolvableLater --> Active_Closed_ResolvableLater: t ≥ tClose


    Active_Closed_ResolvableNever --> Claimable_Refunds: cancelUnresolvable()
    Active_Closed_ResolvableLater --> Active_Closed_ResolvableNow: t ≥ tResolve



    Active_Closed_ResolvableNow --> resolutionType: _resolve()
    resolutionType --> Claimable_Refunds: NoWinners
    resolutionType --> Claimable_Payouts: Winners

    Claimable_Refunds --> [*]
    Claimable_Payouts --> [*]
```

All `Active_*` states are represented with a single on-chain `internalState` of `RunningOrClosed`, but the `getVirtualFloorState()` function combines `internalState` with other inputs to determine the actual state.

## ChallengeableCreatorOracle

We now explode the `RunningOrClosed_ClosedResolvable` state into further sub-states, as stored on the `ChallengeableCreatorOracle` contract:

```mermaid
stateDiagram-v2
    %% Conditional states
    state RunningOrClosed_Closed <<choice>>
    state RunningOrClosed_ClosedResolvable_ResultComplete <<choice>>
    state resolutionType <<choice>>

    [*] --> None

    None --> RunningOrClosed_Running: createVirtualFloor()

    RunningOrClosed_* --> CancelledFlagged: cancelFlagged()

    RunningOrClosed_Running --> RunningOrClosed_Closed: t ≥ tClose

    RunningOrClosed_Closed --> RunningOrClosed_ClosedUnresolvable: has commits to < 2 outcomes
    RunningOrClosed_Closed --> RunningOrClosed_ClosedPreResolvable: has commits to ≥ 2 outcomes

    RunningOrClosed_ClosedUnresolvable --> CancelledUnresolvable: cancelUnresolvable()

    RunningOrClosed_ClosedPreResolvable --> RunningOrClosed_ClosedResolvable_ResultNone: t ≥ tResolve

    %% RunningOrClosed_ClosedResolvable_* --> RunningOrClosed_ClosedResolvable_ResultComplete
    RunningOrClosed_ClosedResolvable_ResultNone --> RunningOrClosed_ClosedResolvable_ResultSet: setResult()\n@ t ≤ tResultSetMax
    RunningOrClosed_ClosedResolvable_ResultSet --> RunningOrClosed_ClosedResolvable_ResultChallenged: challengeSetResult()\n@ t ≤ tResultChallengeMax
    RunningOrClosed_ClosedResolvable_ResultChallenged --> RunningOrClosed_ClosedResolvable_ResultComplete: finalizeChallenge()
    RunningOrClosed_ClosedResolvable_ResultSet --> RunningOrClosed_ClosedResolvable_ResultComplete: confirmUnchallengedResult()\n@ t > tResultChallengeMax
    RunningOrClosed_ClosedResolvable_ResultNone --> RunningOrClosed_ClosedResolvable_ResultComplete: finalizeUnsetResult()\n@ t > tResultSetMax

    RunningOrClosed_ClosedResolvable_ResultComplete --> resolutionType: _resolve()
    resolutionType --> CancelledResolvedNoWinners: CancelledNoWinners
    resolutionType --> ResolvedWinners: Winners

    %% Stop-states
    CancelledFlagged --> [*]
    CancelledUnresolvable --> [*]
    CancelledResolvedNoWinners --> [*]
    ResolvedWinners --> [*]
```

The only details that are not visible in this diagram are that:
1. When the base contract’s “computed” state (as reported by `getVirtualFloorState()`) goes into `CancelledResolvedNoWinners | ResolvedWinners`, in the extending `ChallengeableCreatorOracle` contract the corresponding `Resolution.state` for that VF will be moved (in parallel) to state `ResolutionState.Complete`.
2. If a VF set-result has been challenged, and therefore its `Resolution.state` in `ChallengeableCreatorOracle` is `ResolutionState.Challenged`, if at that moment the base contract’s state is forced by the platform-admin into `CancelledFlagged`, the `Resolution.state` will be moved (in parallel) into `ResolutionState.ChallengeCancelled`.
