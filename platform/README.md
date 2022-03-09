# DoubleDice platform contract

The DoubleDice (DD) platform allows users to commit an amount of money (ERC-20 tokens) to a prediction that specific future event resolves to a specific outcome from a predefined list of 2 or more mutually-exclusive possible outcomes. E.g. the specific event could be “FIFA World Cup 2022 final qualifiers winner” and 16 outcomes would represent the 16 participating football teams.

The DD platform enables a group of users to *virtually* gather on a *floor* and announce their commitments to different outcomes: “Put me 10$ on a Brazil win”, “Put me 100$ on an Argentina win”. In keeping with this imagery, the entire set of data pertaining to an event and its associated commitments are termed a *virtual-floor* (VF).

The DD platform is distinguished by the following two features:

1. When a VF is resolved to one of the outcomes, the total funds committed to all non-winning outcomes are distributed between the commitments to the winning outcome, proportionally to the amount committed to that winning-outcome, but also weighted with a special *beta* factor such that commitments that were made earlier are rewarded higher.
1. Funds committed to an outcome at a specific timepoint are issued with “commitment receipts” (ERC-1155 token balances) that can then be traded freely between users. Once a VF has been resolved to the winning outcome, the Contract allows users holding commitment balances on the winning outcome to claim their winnings.

## Contract architecture

The DoubleDice platform is implemented in two layers:

1. The generic core framework: A base abstract contract `BaseDoubleDice` that implements the core VF lifecycle (creation-commitment-resolution-claims). All core platform mechanics and its storage variables are kept `private` inside this base contract and cannot be accessed by extending contracts. Instead extending contracts are expected to interact with the base contract through its `public` functions, and through the following `internal` API:

   1. An empty `_onVirtualFloorCreated` hook that extending contracts *may* choose to implement
   2. An empty `_onVirtualFloorConcluded` hook that extending contracts *may* choose to implement
   3. A *internal* `_resolve` function encapsulating the entire VF resolution logic, that extending contracts *must* call in order to resolve the VF to a specific outcome. `BaseDoubleDice` does not expose `_resolve` externally, but it leaves it up to the extending contract to decide under which conditions a VF should be resolved, e.g. one simple implementation (see `SimpleOracle.sol`) could extend `BaseDoubleDice` to allow a VF’s result to be set exclusively by the VF’s creator.

2. The specific implementation: `BaseDoubleDice` sits at the base of a multiple-inheritance diamond. It is extended by multiple contracts, each one adding on its specific functionality, through the interface exposed by the core framework. Finally, those multiple contracts are combined into a single leaf contract `DoubleDice`. In the current implementation, there are three such extensions to the core framework:
   ```mermaid
   classDiagram
   class BaseDoubleDice{
     <<abstract>>
     #_resolve()
     #_onVirtualFloorCreation()
     #_onVirtualFloorConclusion()
   }
   class VirtualFloorMetadataValidator {
     #_onVirtualFloorCreation()
   }
   class CreationQuotas {
     #_onVirtualFloorCreation()
   }
   class ChallengeableCreatorOracle {
     #_onVirtualFloorConclusion()
     +setResult()
   }
   class DoubleDice{
     #_onVirtualFloorCreation()
     #_onVirtualFloorConclusion()
   }
   BaseDoubleDice <|-- VirtualFloorMetadataValidator: is
   BaseDoubleDice <|-- CreationQuotas: is
   BaseDoubleDice <|-- ChallengeableCreatorOracle: is
   VirtualFloorMetadataValidator <|-- DoubleDice: is
   CreationQuotas <|-- DoubleDice: is
   ChallengeableCreatorOracle <|-- DoubleDice: is
   ```

   The individual extensions will be explained in further detail later in this document.

## Core framework: BaseDoubleDice contract

### Base lifecycle

The purpose of the `BaseDoubleDice` contract is to manage the lifecycle of multiple VFs.

At the highest level, a VF goes through the following stages:

```mermaid
stateDiagram-v2
direction LR
[*] --> None
None --> Active: create()
Active --> Claimable: _resolve()
Claimable --> [*]
```

1. A _creator_ (as far as `BaseDoubleDice` is concerned, this could be anyone) calls `createVirtualFloor()` to create a new VF, passing a set of `VirtualFloorCreationParams`. One essential parameter passed as part of this set is the number of outcomes `nOutcomes`. Once a VF has been created, it is put into the `Active` internal state, which is indeed stored in a variable `_internalState`. In the `Active` state, users may (up to a certain time) commit funds to one (or more) of the `nOutcomes` outcomes.
2. When the VF is _resolved_ to a specific outcome, the VF moves to a `Claimable` stage. If the VF is concluded normally, at this stage, the users holding commitment balances on the winning outcome may _claim_ their share of the funds that had been committed to all the losing outcomes.

But in practice, there is also a possibility that a VF is _cancelled_, in which case users holding commitment balances on any of the outcomes may claim back the original committed amount. There are three possible scenarios in which this may happen:
1. A VF is flagged by the community, and that flagging is reviewed by a DD admin who decides to cancel the VF.
2. A VF’s commitment period closes (more on this later) and either:

   - there were 0 commitments to any of the outcomes, or
   - there were commitments, but they were all to the same 1 outcome, e.g. everyone bets on “Argentina win” — If Argentina wins, everybody will a winner and there will no losers whose funds to split; if Argentina loses, everyone will be a loser and there won’t be any winners to share the funds.

   In this scenario the VF is said to be _unresolvable_.

3. A VF is resolved to a specific outcome, but there have been 0 funds committed to this outcome, e.g. in a football match between Italy and Germany with three outcomes: “Italy win”, “Germany win” and “Tie between Italy and Germany”, users commit funds exclusively to “Italy win” and “Germany win” but nobody expects the result to be a tie. The final score is 3-3, and there are no winners.

The contract distinguishes between these different `Claimable` scenarios by splitting this state into `Claimable_Payouts` and `Claimable_Refunds`, and `Claimable_Refunds` state is split into 3 further substates to record the reason for which the VF was cancelled. So the final state diagram is the following:

```mermaid
stateDiagram-v2
state resolutionType <<choice>>
[*] --> None
None --> Active: create()
Active --> Claimable_Refunds_Flagged: cancelFlagged()
Active --> Claimable_Refunds_ResolvableNever: cancelUnresolvable()
Active --> resolutionType: _resolve()
resolutionType --> Claimable_Refunds_ResolvedNoWinners: NoWinners
resolutionType --> Claimable_Payouts: Winners
Claimable_Refunds_Flagged --> [*]
Claimable_Refunds_ResolvableNever --> [*]
Claimable_Refunds_ResolvedNoWinners --> [*]
Claimable_Payouts --> [*]
```

Technically, in order for `BaseDoubleDice` to be able to administer payout/refund claims on a VF, it would be enough for it to know whether that VF is in state `Claimable_Payouts` (in which case it will allow payouts to winners) or in state `Claimable_Refunds` (in which case it will allow refunds to all committers.) So for its basic operation, it does not need to remember _how_ it found itself in `Claimable_Refunds`. But contracts extending the base framework (discussed later) might require that information, which is why the `Claimable_Refunds` state is split into three substates.

### The `Active` stage

When a VF is created, its creator passes a set of creation parameters. As part of those parameters, the creator specifies a _timeline_ for that VF, which is defined by three timepoints:

```
tOpen < tClose ≤ tResolve
```

- `tOpen` marks the _official_ opening of the commitment period. During the commitment period, users may commit funds to the different VF outcomes being the eventual winner.
- At `tClose`, the VF commitment period closes and it is no longer possible for users to commit funds to outcomes. From this point onwards, the only thing to do is to patiently wait until `tResolve`.
- `tResolve` is the earliest time at which the result of the event can be registered on the contract, in order to resolve the VF to one of its outcomes. E.g. if the event in question is a specific football match, `tResolve` could be set to the latest possible official finish-time of the match. 

The purpose of the “buffer period” `tClose ≤ t < tResolve` is that for certain events it might be desirable to halt commitments prior to the actual result being known. For example, for a political election event, the VF creator might want to set `tClose` at the time polling booths open, and then set `tResolve` to the official time at which polling booths close. Although the framework is flexible in this regard, in that it only imposes `tClose ≤ tResolve`, so it is technically even possible to skip this period altogether by setting `tClose == tResolve`.

In actual fact, the term `tOpen` is a bit of a misnomer, because really and truly a VF starts accepting commitments _immediately_ from the moment that it is created, i.e. from the moment that the `createVirtualFloor` transaction is mined, onwards, even if at that point `tOpen` is still a point in the future. So in actual fact, the commitment period is not `tOpen ≤ t < tClose`, but it is simply `t < tClose`. Nevertheless `tOpen` holds a special significance in the DD winning distribution algorithm, and it is explained in the sequel.
