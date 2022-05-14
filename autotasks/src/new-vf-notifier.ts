/* eslint-disable indent */
import { VirtualFloor } from '@doubledice/platform/lib/graph';
import assert from 'assert';
import axios from 'axios';
import { AutotaskEvent, BlockTriggerEvent } from 'defender-autotask-utils';
import { gql, GraphQLClient } from 'graphql-request';
import moment from 'moment';
import {
  BLOCK_EXPLORER_HOST,
  GRAPHQL_ENDPOINT,
  SLACK_WEBHOOK_ENDPOINT
} from './config';
import { constructVfUrl } from './utils';

const VIRTUAL_FLOORS = gql`
  query ($vfIntId: BigInt!) {
    virtualFloors(where: { intId: $vfIntId }) {
      intId
      title
      isTest
      bonusAmount
      outcomes {
        id
      }
      tClose
      tResolve
      paymentToken {
        symbol
      }
    }
  }
`;

const graphqlClient = new GraphQLClient(GRAPHQL_ENDPOINT);


type QueryInput = {
  vfIntId: string
}

type QueryOutput = {
  virtualFloors: VirtualFloor[]
}

// Entrypoint for the Autotask
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function handler(event: AutotaskEvent) {

  const now = moment();

  const formatVf = (vf: VirtualFloor) => {
    const vfUrl = constructVfUrl(vf.intId);
    return [
      vf.isTest ? '🧪' : '🚀',
      `<${vfUrl}|${vf.title}>`,
      `${vf.outcomes.length} outcomes`,
      `🎰 ${vf.bonusAmount} ${vf.paymentToken.symbol}`,
      `closes ${moment.unix(Number(vf.tClose)).from(now)}`,
      `resolvable ${moment.unix(Number(vf.tResolve)).from(now)}`,
    ].join(' | ');
  };


  const logs = [] as string[];
  const log = (message = '') => {
    console.log(message);
    logs.push(message);
  };

  try {
    assert(event.request, 'Assumption broken: event.request');
    assert(event.request.body, 'Assumption broken: event.request.body');
    const blockTriggerEvent = event.request.body as BlockTriggerEvent;
    assert(blockTriggerEvent.type === 'BLOCK', 'Assumption broken: blockTriggerEvent.type === \'BLOCK\'');
    assert(blockTriggerEvent.matchReasons, 'Assumption broken: blockTriggerEvent.matchReasons');
    assert(blockTriggerEvent.matchReasons.length === 1, 'Assumption broken: blockTriggerEvent.matchReasons.length === 1');
    const [eventConditionSummary] = blockTriggerEvent.matchReasons;
    assert(eventConditionSummary.type === 'event', 'Assumption broken: eventConditionSummary.type === \'event\'');
    assert(eventConditionSummary.signature === 'VirtualFloorCreation(uint256,address,uint256,uint256,uint256,uint32,uint32,uint32,uint8,address,uint256,uint256,uint256,(bytes32,bytes))', 'Assumption broken: eventConditionSummary.signature === \'VirtualFloorCreation(uint256,address,uint256,uint256,uint256,uint32,uint32,uint32,uint8,address,uint256,uint256,uint256,(bytes32,bytes))\'');
    const [vfIntId] = eventConditionSummary.args;

    const { virtualFloors } = await graphqlClient.request<QueryOutput, QueryInput>(VIRTUAL_FLOORS, { vfIntId });

    assert(virtualFloors.length === 1, `Assumption broken for vfIntId = ${vfIntId}: virtualFloors.length === 1`);

    const [vf] = virtualFloors;

    const txUrl = `${BLOCK_EXPLORER_HOST}/tx/${blockTriggerEvent.transaction.transactionHash}`;
    log(`:tada: New VF created [<${txUrl}|tx>] — ${formatVf(vf)}`);
  } catch (e: any) {
    console.error(e.message, JSON.stringify(event.request && event.request.body, null, 2));
  } finally {
    if (logs.length > 0) {
      const text = logs.join('\n\n—\n\n');
      await axios.post(SLACK_WEBHOOK_ENDPOINT, { text });
    }
  }
}

// To run locally (this code will not be executed in Autotasks)
if (require.main === module) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const event = require('./sample-vf-creation-sentinel-trigger.json');
  handler(event)
    .then(() => process.exit(0))
    .catch((error: Error) => { console.error(error); process.exit(1); });
}

