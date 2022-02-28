import assert from 'assert';
import { BigNumber, BigNumberish, ContractReceipt, ethers } from 'ethers';
import { RoomEventInfo } from '../lib/contracts';

export type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

export const sleep = (t: number) => new Promise(s => setTimeout(s, t));

export const generateRandomVirtualFloorId = () =>
  BigNumber.from(ethers.utils.hexlify(ethers.utils.randomBytes(8))).shl(5 * 8);

export const toFp18 = (value: number): BigNumber => {
  const sign = Math.sign(value);
  const magnitude = Math.abs(value);
  if (magnitude === 0) {
    return BigNumber.from(0);
  }
  let intermediate = magnitude;
  let i = 0;
  while ((intermediate * 10) <= Number.MAX_SAFE_INTEGER) {
    intermediate *= 10;
    i++; // eslint-disable-line no-plusplus
  }
  if (Math.floor(intermediate) !== intermediate) {
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
  committer: string;
  outcomeIndex: BigNumber;
  timeslot: BigNumber;
  amount: BigNumber;
  beta_e18: BigNumber;
  tokenId: BigNumber;
}

enum VirtualFloorResolutionType {
  'NoWinners',
  'AllWinners',
  'SomeWinners'
}

export interface VirtualFloorResolution {
  virtualFloorId: BigNumber;
  winningOutcomeIndex: BigNumber;
  resolutionType: VirtualFloorResolutionType;
  winnerProfits: BigNumber;
  platformFeeAmount: BigNumber;
  ownerFeeAmount: BigNumber;
}

export const findUserCommitmentEventArgs = (events: ContractReceipt['events']): UserCommitment => {
  return findContractEventArgs(events, 'UserCommitment');
};

export const findVFResolutionEventArgs = (events: ContractReceipt['events']): VirtualFloorResolution => {
  return findContractEventArgs(events, 'VirtualFloorResolution');
};

export const DUMMY_METADATA: RoomEventInfo = {
  category: 'sports',
  subcategory: 'football',
  title: 'Finland vs. Argentina',
  description: 'Finland vs. Argentina FIFA 2022 world cup final',
  isListed: false,
  opponents: [
    { title: 'Finland', image: 'https://upload.wikimedia.org/wikipedia/commons/3/31/Huuhkajat_logo.svg' },
    { title: 'Argentina', image: 'https://upload.wikimedia.org/wikipedia/en/c/c1/Argentina_national_football_team_logo.svg' }
  ],
  outcomes: [
    { title: 'Finland win' },
    { title: 'Argentina win' },
    { title: 'Tie' }
  ],
  resultSources: [
    { title: 'Official FIFA result page', url: 'http://fifa.com/argentina-vs-finland' }
  ]
};

// export const timestampMinuteCeil = (timestamp: BigNumberish) => BigNumber.from(timestamp).add(59).div(60).mul(60);
export const timestampMinuteCeil = (timestamp: number) => Math.ceil(timestamp / 60) * 60;
