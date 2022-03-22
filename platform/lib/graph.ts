/* eslint-disable */

export * from './generated/graphql';

import assert from 'assert';
import { BigNumber as BigDecimal } from 'bignumber.js';
import { BigNumber as EthersBigInteger } from 'ethers';
import {
  VirtualFloor as VirtualFloorEntity,
  VirtualFloorState as VirtualFloorEntityState
} from './generated/graphql';

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
      return {
        claimType: VirtualFloorClaimType.Refunds,
        totalClaimAmount: new BigDecimal(1234.56),
        tokenIds: []
      };
    }
    default:
      return null;
  }
};
