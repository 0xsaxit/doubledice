/* eslint-disable */

export * from './generated/graphql';

import assert from 'assert';
import { BigNumber as BigDecimal } from 'bignumber.js';
import { BigNumber as EthersBigInteger } from 'ethers';
import {
  Outcome as OutcomeEntity,
  VirtualFloor as VirtualFloorEntity,
  VirtualFloorState as VirtualFloorEntityState
} from './generated/graphql';
import { VirtualFloorState as ContractVirtualFloorState } from './helpers/sol-enums';

// e.g. sum([1, 2, 3, 4]) => 10
export const sum = (values: number[]): number => values.reduce((a, b) => a + b)

export enum VirtualFloorClaimType {
  Payouts,
  Refunds
}

export interface PreparedClaim {
  claimType: VirtualFloorClaimType;
  tokenIds: EthersBigInteger[];
  totalClaimAmount: BigDecimal;
}

const MISSING = undefined;
const BLANK = null; // e.g. winnerOutome is "blank" when VF is not yet resolved

export const prepareVirtualFloorClaim = (vf: Partial<VirtualFloorEntity>): PreparedClaim | null => {
  // Assert that the fields have been included in the query
  assert(vf.state !== MISSING, 'Missing field: VirtualFloor.state');
  assert(vf.winningOutcome !== MISSING, 'Missing field: VirtualFloor.winningOutcome');
  assert(vf.winnerProfits !== MISSING, 'Missing field: VirtualFloor.winnerProfits');

  switch (vf.state) {
    case VirtualFloorEntityState.Claimable_Payouts: {
      // Since they are not missing, they must be non-blank since
      // on the Graph they are always set for a VF resolved with winners
      assert(vf.winningOutcome !== BLANK);
      assert(vf.winnerProfits !== BLANK);

      assert(vf.winningOutcome.totalWeightedSupply !== MISSING, 'Missing field: VirtualFloor.winningOutcome.totalWeightedSupply');

      const winnerProfits = new BigDecimal(vf.winnerProfits);
      const winningOutcomeTotalAmountTimesBeta = new BigDecimal(vf.winningOutcome.totalWeightedSupply);

      assert(vf.winningOutcome.userOutcomes !== MISSING);
      assert(vf.winningOutcome.userOutcomes.length === 0 || vf.winningOutcome.userOutcomes.length === 1);

      if (vf.winningOutcome.userOutcomes.length === 1) {

        const [userOutcome] = vf.winningOutcome.userOutcomes;

        assert(userOutcome.totalBalance !== MISSING);
        assert(userOutcome.totalWeightedBalance !== MISSING);

        const originalCommitment = new BigDecimal(userOutcome.totalBalance);
        const userTotalAmountTimesBeta = new BigDecimal(userOutcome.totalWeightedBalance);
        const profit = userTotalAmountTimesBeta.times(winnerProfits).div(winningOutcomeTotalAmountTimesBeta);
        const totalClaimAmount = originalCommitment.plus(profit);

        assert(userOutcome.userOutcomeTimeslots !== MISSING);

        const tokenIds = userOutcome.userOutcomeTimeslots.map(userOutcomeTimeslot => {
          assert(userOutcomeTimeslot.outcomeTimeslot !== MISSING);
          assert(userOutcomeTimeslot.outcomeTimeslot.tokenId !== MISSING);
          return EthersBigInteger.from(userOutcomeTimeslot.outcomeTimeslot.tokenId);
        });

        return {
          claimType: VirtualFloorClaimType.Payouts,
          totalClaimAmount,
          tokenIds
        }
      } else /* if (vf.winningOutcome.userOutcomes.length === 0) */ {
        return {
          claimType: VirtualFloorClaimType.Payouts,
          totalClaimAmount: new BigDecimal(0),
          tokenIds: []
        }
      }
    }
    case VirtualFloorEntityState.Claimable_Refunds_Flagged:
    case VirtualFloorEntityState.Claimable_Refunds_ResolvedNoWinners:
    case VirtualFloorEntityState.Claimable_Refunds_ResolvableNever: {
      assert(vf.outcomes !== MISSING);

      // ToDo: What we really want to assert here, is that all outcomes are included on the query response,
      // (e.g. the query has not filtered out one of the outcomes)
      // Ideally, we would generate bindings directly from named GQL queries,
      // and we would not need to encode these assertions manually.
      assert(vf.outcomes.length >= 2);

      const individualOutcomeSubClaims = vf.outcomes.map((outcome: OutcomeEntity): Omit<PreparedClaim, 'claimType'> => {
        assert(outcome.userOutcomes !== MISSING);
        assert(outcome.userOutcomes.length === 0 || outcome.userOutcomes.length === 1);
        if (outcome.userOutcomes.length === 1) {
          const [userOutcome] = outcome.userOutcomes;
          assert(userOutcome.totalBalance !== MISSING);
          const totalClaimAmount = new BigDecimal(userOutcome.totalBalance);
          assert(userOutcome.userOutcomeTimeslots !== MISSING);
          const tokenIds = userOutcome.userOutcomeTimeslots.map(userOutcomeTimeslot => {
            assert(userOutcomeTimeslot.outcomeTimeslot !== MISSING);
            assert(userOutcomeTimeslot.outcomeTimeslot.tokenId !== MISSING);
            return EthersBigInteger.from(userOutcomeTimeslot.outcomeTimeslot.tokenId);
          });
          return {
            totalClaimAmount,
            tokenIds
          };
        } else /* if (outcome.userOutcomes.length === 0) */ {
          return {
            totalClaimAmount: new BigDecimal(0),
            tokenIds: []
          };
        }
      });

      return {
        claimType: VirtualFloorClaimType.Refunds,
        ...individualOutcomeSubClaims.reduce((aggregate, subClaim) => ({
          totalClaimAmount: aggregate.totalClaimAmount.plus(subClaim.totalClaimAmount),
          tokenIds: [...aggregate.tokenIds, ...subClaim.tokenIds]
        }))
      };
    }
    default:
      return null;
  }
};

/**
 * Mirrors logic in VirtualFloors.sol
 */
export const computeContractVirtualFloorState = (vf: VirtualFloorEntity, timestamp: number): ContractVirtualFloorState => {
  // ensure fields have been included on query
  assert(vf.tClose !== undefined);
  assert(vf.tResolve !== undefined);
  assert(vf.bonusAmount !== undefined);
  assert(vf.outcomes != undefined);
  assert(vf.outcomes.every(({ totalSupply }) => totalSupply !== undefined));

  const tClose = Number(vf.tClose);
  const tResolve = Number(vf.tResolve);

  // bonusAmount contributes to nonzeroOutcomeCount as if it were another outcome
  const totals = [...vf.outcomes.map(({ totalSupply }) => totalSupply), vf.bonusAmount];
  const nonzeroOutcomeCount = sum(totals.map(value => new BigDecimal(value).eq(0) ? 0 : 1));

  switch (vf.state) {
    case VirtualFloorEntityState.Active_ResultSet:
    case VirtualFloorEntityState.Active_ResultChallenged:
      return ContractVirtualFloorState.Active_Closed_ResolvableNow;
    case VirtualFloorEntityState.Active_ResultNone: {
      // solhint-disable-next-line not-rely-on-time
      if (timestamp < tClose) {
        if (nonzeroOutcomeCount >= 2) {
          return ContractVirtualFloorState.Active_Open_ResolvableLater;
        } else {
          return ContractVirtualFloorState.Active_Open_MaybeResolvableNever;
        }
      } else {
        if (nonzeroOutcomeCount >= 2) {
          if (timestamp < tResolve) {
            return ContractVirtualFloorState.Active_Closed_ResolvableLater;
          } else {
            return ContractVirtualFloorState.Active_Closed_ResolvableNow;
          }
        } else {
          return ContractVirtualFloorState.Active_Closed_ResolvableNever;
        }
      }
    }
    case VirtualFloorEntityState.Claimable_Refunds_Flagged:
      return ContractVirtualFloorState.Claimable_Refunds_Flagged;
    case VirtualFloorEntityState.Claimable_Refunds_ResolvableNever:
      return ContractVirtualFloorState.Claimable_Refunds_ResolvableNever;
    case VirtualFloorEntityState.Claimable_Refunds_ResolvedNoWinners:
      return ContractVirtualFloorState.Claimable_Refunds_ResolvedNoWinners;
    case VirtualFloorEntityState.Claimable_Payouts:
      return ContractVirtualFloorState.Claimable_Payouts;
  }
}

/**
 * Returns whether an Outcome in a Claimable_Payouts-state VF is the winner or not.
 */
export const isWinningOutcome = (outcomeOfVfInClaimablePayoutsState: OutcomeEntity) => {
  assert(outcomeOfVfInClaimablePayoutsState.index !== undefined, 'Missing .index');

  const vf = outcomeOfVfInClaimablePayoutsState.virtualFloor;
  assert(vf !== undefined, 'Missing .virtualFloor');

  const winningOutcome = vf.winningOutcome;
  // Before assert TypeScript knows that winningOutcome type is: Outcome | null | undefined
  // After assert TypeScript knows that winningOutcome type is: Outcome | null
  assert(winningOutcome !== undefined, 'Missing .virtualFloor.winningOutcome');

  assert(vf.state !== undefined, 'Missing .virtualFloor.state');

  assert(vf.state === VirtualFloorEntityState.Claimable_Payouts, 'isWinningOutcome(outcome) can only be called on a VF in Claimable_Payouts state');

  assert(winningOutcome !== null, 'Broken assumption: Outcome of a VF in Claimable_Payouts state always has non-null winningOutcome');

  return outcomeOfVfInClaimablePayoutsState.index === winningOutcome.index;
}
