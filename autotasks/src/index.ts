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
import { zipArrays3 } from './utils';
/* eslint-disable indent */

const configs = {
  mumbai: {
    GRAPHQL_ENDPOINT: 'https://api.thegraph.com/subgraphs/name/doubledicedev/doubledice-mumbai2',
    ADMIN_APP_URL: 'https://oneclickdapp.com/prelude-quota',
    APP_BASE_URL: 'https://beta.doubledice.com',
    // See https://doubledice.slack.com/services/B03AUCBPLJU
    SLACK_WEBHOOK_ENDPOINT: 'https://hooks.slack.com/services/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',
    BLOCK_EXPLORER_HOST: 'https://mumbai.polygonscan.com',
    DOUBLEDICE_CONTRACT_ADDRESS: '0x5848A6Df71aE96e9C7544fC07815Ab5B13530c6b',
    LOG_NO_ACTION: false,
  },
  polygon: {
    GRAPHQL_ENDPOINT: 'https://api.thegraph.com/subgraphs/name/ddvfs-com/ddvfs-polygon',
    ADMIN_APP_URL: 'https://oneclickdapp.com/santana-sting',
    APP_BASE_URL: 'https://ddvfs.com',
    // See https://doubledice.slack.com/services/B03AUCBPLJU
    SLACK_WEBHOOK_ENDPOINT: 'https://hooks.slack.com/services/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',
    BLOCK_EXPLORER_HOST: 'https://polygonscan.com',
    DOUBLEDICE_CONTRACT_ADDRESS: '0x29370D56050FaA11f971B9b7Dc498c99Fd57fEc7',
    LOG_NO_ACTION: false,
  },
};

// ToDo: For now switch manually between configs.polygon and configs.mumbai before building/deploying
const {
  GRAPHQL_ENDPOINT,
  APP_BASE_URL,
  SLACK_WEBHOOK_ENDPOINT,
  BLOCK_EXPLORER_HOST,
  DOUBLEDICE_CONTRACT_ADDRESS,
  LOG_NO_ACTION,
} = configs.polygon;

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
  const vfStates = await Promise.all(virtualFloors.map(({ intId }) => ddContract.getVirtualFloorState(intId)));
  const vfResolutionStates = (await Promise.all(virtualFloors.map(({ intId }) => ddContract.resolutions(intId)))).map(({ state }) => state);
  const vfsWithOnChainState = zipArrays3(virtualFloors, vfStates, vfResolutionStates).map(([vf, onChainState, onChainResolutionState]) => ({ ...vf, onChainState, onChainResolutionState }));

  type VfWithOnChainState = (typeof vfsWithOnChainState)[0];

  let unresolvables = [] as VfWithOnChainState[];
  let unsetFinalizables = [] as VfWithOnChainState[];
  let unchallengedConfirmables = [] as VfWithOnChainState[];
  let challenged = [] as VfWithOnChainState[];

  for (const vf of vfsWithOnChainState) {
    switch (vf.onChainState) {
      case VirtualFloorState.Active_Closed_ResolvableNever:
        unresolvables = [...unresolvables, vf];
        break;
      case VirtualFloorState.Active_Closed_ResolvableNow: {
        switch (vf.onChainResolutionState) {
          case ResolutionState.None: {
            const tResultSetMax = Number(vf.tResultSetMax);
            if (now > tResultSetMax) {
              unsetFinalizables = [...unsetFinalizables, vf];
            }
            break;
          }
          case ResolutionState.Set: {
            assert(vf.tResultChallengeMax);
            if (now > Number(vf.tResultChallengeMax)) {
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
      case VirtualFloorState.Active_Closed_ResolvableLater:
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


const constructVfUrl = (intId: string) => `${APP_BASE_URL}/bet/#!/${intId}`;


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

