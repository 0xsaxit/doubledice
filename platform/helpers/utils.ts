import assert from 'assert';
import { BigNumber, BigNumberish, ContractReceipt, ethers } from 'ethers';
import {
  encodeVirtualFloorMetadata,
  RoomEventInfo
} from '../lib/contracts';

export const toFp18 = (value: number | string): BigNumber => {
  const numericValue = typeof value === 'number' ? value : parseFloat(value);
  const sign = Math.sign(numericValue);
  const magnitude = Math.abs(numericValue);
  if (magnitude === 0) {
    return BigNumber.from(0);
  }
  let intermediate = magnitude;
  let i = 0;
  while ((intermediate * 10) <= Number.MAX_SAFE_INTEGER) {
    intermediate *= 10;
    i++; // eslint-disable-line no-plusplus
  }
  if (Math.trunc(intermediate) !== intermediate) {
    throw new Error('!');
  }
  return BigNumber.from(intermediate).mul(BigNumber.from(10).pow(BigNumber.from(18 - i))).mul(BigNumber.from(sign));
};

export const sumOf = (...values: BigNumber[]): BigNumber =>
  values.reduce((a: BigNumber, b: BigNumber) => a.add(b), BigNumber.from(0));

export const formatUsdc = (wei: BigNumberish): string =>
  `${(BigNumber.from(wei).toNumber() / 1e6).toFixed(6).replace(/\.(\d{2})(\d{4})/, '.$1,$2')} USDC`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const findContractEventArgs = <T = any>(events: ContractReceipt['events'], name: string): T => {
  assert(events !== undefined);
  const event = events.find(({ event }) => event === name);
  assert(event);
  assert(event.args);
  return event.args as unknown as T;
};

export interface UserCommitment {
  virtualFloorId: BigNumber;
  outcomeIndex: number;
  timeslot: BigNumber;
  amount: BigNumber;
  tokenId: BigNumber;
}

export const findUserCommitmentEventArgs = (events: ContractReceipt['events']): UserCommitment => {
  return findContractEventArgs(events, 'UserCommitment');
};

export const DUMMY_METADATA: RoomEventInfo = {
  category: 'sports',
  subcategory: 'football',
  title: 'Finland vs. Argentina',
  description: 'Finland vs. Argentina FIFA 2022 world cup final',
  isListed: false,
  opponents: {
    titles: [
      'Finland',
      'Argentina',
    ],
    images: [
      'https://upload.wikimedia.org/wikipedia/commons/3/31/Huuhkajat_logo.svg',
      'https://upload.wikimedia.org/wikipedia/en/c/c1/Argentina_national_football_team_logo.svg',
    ]
  },
  outcomes: {
    titles: [
      'Finland win',
      'Argentina win',
      'Tie',
    ]
  },
  resultSources: {
    titles: [
      'Official FIFA result page',
    ],
    urls: [
      'http://fifa.com/argentina-vs-finland',
    ]
  },
  discordChannelId: '123456789',
};

export const generateRandomVirtualFloorId = () =>
  BigNumber.from(ethers.utils.hexlify(ethers.utils.randomBytes(8))).shl(5 * 8);

export const ENCODED_DUMMY_METADATA = encodeVirtualFloorMetadata(DUMMY_METADATA);

export const timestampMinuteCeil = (timestamp: number) => Math.ceil(timestamp / 60) * 60;

export const toTimestamp = (datetime: string): BigNumber => BigNumber.from(new Date(datetime).getTime() / 1000);
