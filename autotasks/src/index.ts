import { DoubleDice, DoubleDice__factory, VirtualFloorState } from '@doubledice/platform/lib/contracts';
import { VirtualFloor, VirtualFloorState as VirtualFloorEntityState } from '@doubledice/platform/lib/graph';
import assert from 'assert';
import axios from 'axios';
import { Relayer } from 'defender-relay-client';
import { DefenderRelayProvider, DefenderRelaySigner } from 'defender-relay-client/lib/ethers';
import { RelayerParams } from 'defender-relay-client/lib/relayer';
import { ContractTransaction } from 'ethers';
import { gql, GraphQLClient } from 'graphql-request';
import moment from 'moment';
import { zipArrays } from './utils';
/* eslint-disable indent */


const GRAPHQL_ENDPOINT = 'https://api.thegraph.com/subgraphs/name/doubledicedev/doubledice-mumbai2';
const ADMIN_APP_URL = 'https://oneclickdapp.com/prelude-quota';
const APP_BASE_URL = 'https://beta.doubledice.com';

// See https://doubledice.slack.com/services/B03AUCBPLJU
const SLACK_WEBHOOK_ENDPOINT = 'https://hooks.slack.com/services/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';

const BLOCK_EXPLORER_HOST = 'https://mumbai.polygonscan.com';

const DOUBLEDICE_CONTRACT_ADDRESS = '0x5848A6Df71aE96e9C7544fC07815Ab5B13530c6b';

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
      state
      tClose
      tResolve
      tResultSetMax
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
}): Promise<[VirtualFloor[], VirtualFloor[]]> => {
  const states = await Promise.all(virtualFloors.map(({ intId }) => ddContract.getVirtualFloorState(intId)));

  const vfsWithOnChainState = zipArrays(virtualFloors, states).map(([vf, onChainState]) => ({ ...vf, onChainState }));

  type VfWithOnChainState = (typeof vfsWithOnChainState)[0];

  let unresolvableVfs = [] as VfWithOnChainState[];
  let finalizableVfs = [] as VfWithOnChainState[];

  for (const vf of vfsWithOnChainState) {
    switch (vf.onChainState) {
      case VirtualFloorState.Active_Closed_ResolvableNever:
        unresolvableVfs = [...unresolvableVfs, vf];
        break;
      case VirtualFloorState.Active_Closed_ResolvableNow: {
        const tResultSetMax = Number(vf.tResultSetMax);
        if (now > tResultSetMax) {
          finalizableVfs = [...finalizableVfs, vf];
        }
        break;
      }
      case VirtualFloorState.Active_Closed_ResolvableLater:
        break;
      default:
        assert(false, `Unexpected VF ${vf.intId} in on-chain state ${vf.onChainState}`);
    }
  }

  return [unresolvableVfs, finalizableVfs];
};


// Entrypoint for the Autotask
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function handler(credentials: RelayerParams) {
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

    if (virtualFloors.length === 0) {
      console.log('No unset VFs');
      return;
    }

    const provider = new DefenderRelayProvider(credentials);
    const signer = new DefenderRelaySigner(credentials, provider, { speed: 'fast' });
    const ddContract = DoubleDice__factory.connect(DOUBLEDICE_CONTRACT_ADDRESS, signer);

    const vfs1 = virtualFloors.filter(({ state }) => state === VirtualFloorEntityState.Active_ResultNone);

    const [unresolvables, finalizables] = await splitVfs({
      now,
      ddContract,
      virtualFloors: vfs1
    });

    let txCount = 0;

    if (unresolvables.length > 0) {
      log(`${unresolvables.length} unresolvable VFs: ${unresolvables.map(({ intId }) => intId.toString()).join(', ')}`);

      const [unresolvable] = unresolvables;
      const { hash, transactionId } = await ddContract.cancelVirtualFloorUnresolvable(unresolvable.intId) as DefenderContractTransaction;
      txCount += 1;

      const txUrl = `${BLOCK_EXPLORER_HOST}/tx/${hash}`;
      // const { hash } = await relayer.query(transactionId);
      log(`Called cancelVirtualFloorUnresolvable on VF with id ${unresolvable.intId}`);
      log(`=> transactionId = ${transactionId}, txHash = <${hash}|${txUrl}>`);
    } else {
      log('No VFs currently need cancelVirtualFloorUnresolvable to be called on them.');
    }

    log('\n\n——\n\n');

    if (finalizables.length > 0) {
      const vfMessages = finalizables.map((vf, pos) => {
        const tResultSetMax = Number(vf.tResultSetMax);
        // const ago = now - tResultSetMax;

        const ago = moment.unix(tResultSetMax).from(nowDate);
        const url = `${APP_BASE_URL}/bet/${vf.intId}`;
        return [
          `${1 + pos}/${finalizables.length}: Result has not been set on VF <${url}|${vf.title}>.`,
          `Set window expired ${ago}.`,
          `Total funds committed: ${vf.totalSupply} ${vf.paymentToken.symbol}`,
          `Result ${vf.resultSources.length === 1 ? 'source' : 'sources'}: ${vf.resultSources.map(({ title, url }) => `<${url}|${title}>`).join(', ')}`,
          `To set result, connect to <${ADMIN_APP_URL}|admin app> with account having \`OPERATOR_ROLE\` and:`,
          ...vf.outcomes.map(outcome => `- Call \`finalizeUnsetResult(${vf.intId}, ${outcome.index})\` for "${outcome.title}"`),
        ].join('\n');
      });

      const combinedMessage = vfMessages.join('\n\n—\n\n');
      log(combinedMessage);
    } else {
      log('No VFs currently need finalizing by OPERATOR');
    }
  } finally {
    const text = logs.join('\n\n—\n\n');
    await axios.post(SLACK_WEBHOOK_ENDPOINT, { text });
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

