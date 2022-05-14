/* eslint-disable indent */
import { DoubleDice, DoubleDice__factory, ResolutionState, VirtualFloorState } from '@doubledice/platform/lib/contracts';
import { VirtualFloor } from '@doubledice/platform/lib/graph';
import assert from 'assert';
import axios from 'axios';
import { Relayer } from 'defender-relay-client';
import { DefenderRelayProvider, DefenderRelaySigner } from 'defender-relay-client/lib/ethers';
import { RelayerParams } from 'defender-relay-client/lib/relayer';
import { ContractTransaction } from 'ethers';
import { gql, GraphQLClient } from 'graphql-request';
import moment from 'moment';
import {
  BLOCK_EXPLORER_HOST,
  DD_ENV,
  DOUBLEDICE_CONTRACT_ADDRESS,
  GRAPHQL_ENDPOINT,
  LOG_NO_ACTION,
  SLACK_WEBHOOK_ENDPOINT
} from './config';
import { constructVfUrl, zipArrays3 } from './utils';

const QUERY_UNSET = gql`
  query ($now: BigInt) {
    virtualFloors(
      where: {
        state_in: [
          Active_ResultNone,
          Active_ResultSet,
          Active_ResultChallenged
        ],
        tClose_lt: $now
      },
      orderBy: tClose
    ) {
      intId
      isTest
      state
      tClose
      tResolve
      tResultSetMax
      tResultChallengeMax
      totalSupply
      paymentToken {
        symbol
      }
      resultSources {
        title
        url
      }
      outcomes {
        index
        title
      }
      title
    }
  }
`;

const graphqlClient = new GraphQLClient(GRAPHQL_ENDPOINT);


type QueryInput = {
  now: number
}

type QueryOutput = {
  virtualFloors: VirtualFloor[]
}

type DefenderContractTransaction = ContractTransaction & {
  transactionId: string
}

const splitVfs = async ({
  now,
  ddContract,
  virtualFloors
}: {
  now: number;
  ddContract: DoubleDice;
  virtualFloors: VirtualFloor[];
}): Promise<{
  unresolvables: VirtualFloor[],
  unsetFinalizables: VirtualFloor[],
  unchallengedConfirmables: VirtualFloor[],
  challenged: VirtualFloor[],
}> => {
  process.stdout.write(`DD_ENV: ${DD_ENV}\n`);

  const vfStates = await Promise.all(virtualFloors.map(({ intId }) => ddContract.getVirtualFloorState(intId)));
  const vfResolutions = (await Promise.all(virtualFloors.map(({ intId }) => ddContract.resolutions(intId))));
  const vfsWithOnChainData = zipArrays3(virtualFloors, vfStates, vfResolutions)
    .map(([vf, onChainState, onChainResolution]) => ({ ...vf, onChainState, onChainResolution }));

  type VfGraphEntityPlusOnChainData = (typeof vfsWithOnChainData)[0];

  let unresolvables = [] as VfGraphEntityPlusOnChainData[];
  let unsetFinalizables = [] as VfGraphEntityPlusOnChainData[];
  let unchallengedConfirmables = [] as VfGraphEntityPlusOnChainData[];
  let challenged = [] as VfGraphEntityPlusOnChainData[];

  for (const vf of vfsWithOnChainData) {
    switch (vf.onChainState) {
      case VirtualFloorState.Active_Closed_ResolvableNever:
        unresolvables = [...unresolvables, vf];
        break;
      case VirtualFloorState.Active_Closed_ResolvableLater:
        // VF is in closed period... nothing to do but wait for resolve-time.
        break;
      case VirtualFloorState.Active_Closed_ResolvableNow: {
        switch (vf.onChainResolution.state) {
          case ResolutionState.None: {
            const tResultSetMax = Number(vf.tResultSetMax);
            if (now > tResultSetMax) {
              unsetFinalizables = [...unsetFinalizables, vf];
            }
            break;
          }
          case ResolutionState.Set: {
            // Note: On-chain resolution.state is ResolutionState.Set,
            // but event ResultUpdate(action=ResolutionState.Set) might have not yet propagated to Graph,
            // which would result in vf.tResultChallengeMax still being null.
            // So we use on-chain resolution.tResultChallengeMax, which will always be in sync
            // with on-chain resolution.state.
            assert(vf.onChainResolution.tResultChallengeMax);
            if (now > vf.onChainResolution.tResultChallengeMax) {
              unchallengedConfirmables = [...unchallengedConfirmables, vf];
            }
            break;
          }
          case ResolutionState.Challenged: {
            challenged = [...challenged, vf];
            break;
          }
          default: {
            break;
          }
        }
        break;
      }
      case VirtualFloorState.Claimable_Payouts:
      case VirtualFloorState.Claimable_Refunds_ResolvedNoWinners:
      case VirtualFloorState.Claimable_Refunds_ResolvableNever:
      case VirtualFloorState.Claimable_Refunds_Flagged:
        // Graph always lags behind contract, so maybe it was Active in Graph,
        // but has since been moved to Claimable on-chain.
        break;
      default:
        assert(false, `Unexpected VF ${vf.intId} in on-chain state ${vf.onChainState}`);
    }
  }

  return {
    unresolvables,
    unsetFinalizables,
    unchallengedConfirmables,
    challenged
  };
};

// Entrypoint for the Autotask
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function handler(credentials: RelayerParams) {

  const now = moment();

  const formatVf = (vf: VirtualFloor, deadline?: number) => {
    const vfUrl = constructVfUrl(vf.intId);
    return [
      vf.isTest ? '🧪' : '🚀',
      `<${vfUrl}|${vf.title}>`,
      `🏦 ${vf.totalSupply} ${vf.paymentToken.symbol}`,
      ...(deadline ? [`window expired ${moment.unix(deadline).from(now)}`] : [])
    ].join(' | ');
  };


  const logs = [] as string[];
  const log = (message = '') => {
    console.log(message);
    logs.push(message);
  };

  try {
    const relayer = new Relayer(credentials);
    const relayerModel = await relayer.getRelayer();
    console.log(`Relayer address is ${relayerModel.address}`);

    const nowDate = new Date();

    const now = Math.floor(nowDate.getTime() / 1000);

    const { virtualFloors } = await graphqlClient.request<QueryOutput, QueryInput>(QUERY_UNSET, {
      now
    });

    const provider = new DefenderRelayProvider(credentials);
    const signer = new DefenderRelaySigner(credentials, provider, { speed: 'fast' });
    const ddContract = DoubleDice__factory.connect(DOUBLEDICE_CONTRACT_ADDRESS, signer);

    const {
      unresolvables,
      unsetFinalizables,
      unchallengedConfirmables,
      challenged,
    } = await splitVfs({
      now,
      ddContract,
      virtualFloors
    });

    if (unsetFinalizables.length > 0) {
      log(`${unsetFinalizables.length} VFs’ set-window has expired without their creator having set their result, so they need to have \`finalizeUnsetResult\` called on them (manually by \`OPERATOR\`)${unsetFinalizables.length === 0 ? '.' : `:\n${unsetFinalizables.map((vf, index) => {
        assert(vf.tResultSetMax);
        return `${1 + index}. ${formatVf(vf, Number(vf.tResultSetMax))}`;
      }).join('\n')}`}`);
    } else {
      if (LOG_NO_ACTION) {
        log('No VFs need to have `finalizeUnsetResult` called on them.');
      }
    }

    if (challenged.length > 0) {
      log(`${challenged.length} VFs’ result was challenged, so they need to have \`finalizeChallenge\` called on them (manually by \`OPERATOR\`)${challenged.length === 0 ? '.' : `:\n${challenged.map((vf, index) => {
        return `${1 + index}. ${formatVf(vf)}`;
      }).join('\n')}`}`);
    } else {
      if (LOG_NO_ACTION) {
        log('No VFs need to have `finalizeChallenge` called on them.');
      }
    }

    if (unresolvables.length > 0) {
      log(`${unresolvables.length} VFs’ close-time has arrived, but there weren’t bets on enough outcomes. Therefore these VFs need to have \`cancelVirtualFloorUnresolvable\` called on them (automatically)${unresolvables.length === 0 ? '.' : `:\n${unresolvables.map((vf, index) => {
        return `${1 + index}. ${formatVf(vf)}`;
      }).join('\n')}`}`);

      const [vfToSettle] = unresolvables;
      const { hash, transactionId } = await ddContract.cancelVirtualFloorUnresolvable(vfToSettle.intId) as DefenderContractTransaction;
      const txUrl = `${BLOCK_EXPLORER_HOST}/tx/${hash} `;
      // const { hash } = await relayer.query(transactionId);
      log(`\`cancelVirtualFloorUnresolvable\` called automatically on <${constructVfUrl(vfToSettle.intId)}|${vfToSettle.title}>: <${txUrl}|${hash}>/${transactionId}`);
    } else {
      if (LOG_NO_ACTION) {
        log('No VFs need to have `cancelVirtualFloorUnresolvable` called on them.');
      }
    }

    if (unchallengedConfirmables.length > 0) {
      log(`${unchallengedConfirmables.length} VFs’ challenge-window has expired without anyone having challenged the result set by the VF creator, so they need to have \`confirmUnchallengedResult\` called on them (automatically)${unchallengedConfirmables.length === 0 ? '.' : `:\n${unchallengedConfirmables.map((vf, index) => {
        assert(vf.tResultChallengeMax);
        return `${1 + index}. ${formatVf(vf, Number(vf.tResultChallengeMax))}`;
      }).join('\n')}`}`);

      const [vfToSettle] = unchallengedConfirmables;
      const { hash, transactionId } = await ddContract.confirmUnchallengedResult(vfToSettle.intId) as DefenderContractTransaction;
      const txUrl = `${BLOCK_EXPLORER_HOST}/tx/${hash} `;
      // const { hash } = await relayer.query(transactionId);
      log(`\`confirmUnchallengedResult\` called automatically on <${constructVfUrl(vfToSettle.intId)}|${vfToSettle.title}>: <${txUrl}|${hash}>/${transactionId}`);
    } else {
      if (LOG_NO_ACTION) {
        log('No VFs need to have `confirmUnchallengedResult` called on them.');
      }
    }

  } finally {
    if (logs.length > 0) {
      const text = logs.join('\n\n—\n\n');
      await axios.post(SLACK_WEBHOOK_ENDPOINT, { text });
    }
  }
}

// Sample typescript type definitions
type EnvInfo = {
  API_KEY: string;
  API_SECRET: string;
  DOUBLEDICE_CONTRACT_ADDRESS: string;
}

// To run locally (this code will not be executed in Autotasks)
if (require.main === module) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('dotenv').config();
  const {
    API_KEY: apiKey,
    API_SECRET: apiSecret
  } = process.env as EnvInfo;
  handler({ apiKey, apiSecret })
    .then(() => process.exit(0))
    .catch((error: Error) => { console.error(error); process.exit(1); });
}

