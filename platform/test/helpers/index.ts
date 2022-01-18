import assert from 'assert';
import { BigNumber, BigNumberish, ContractReceipt } from 'ethers';
import { ethers } from 'hardhat';

export type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

export const sleep = t => new Promise(s => setTimeout(s, t));


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
  feeAmount: BigNumber;
}

export const findUserCommitmentEventArgs = (events: ContractReceipt['events']): UserCommitment => {
  return findContractEventArgs(events, 'UserCommitment');
};

export const findVFResolutionEventArgs = (events: ContractReceipt['events']): VirtualFloorResolution => {
  return findContractEventArgs(events, 'VirtualFloorResolution');
};

export const DUMMY_METADATA_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000';

export class EvmCheckpoint {
  private snapshot: string;

  private constructor(initSnapshot: string) {
    this.snapshot = initSnapshot;
  }

  static async create(log = false): Promise<EvmCheckpoint> {
    const snapshot = await ethers.provider.send('evm_snapshot', []);
    if (log) console.log(`Captured EVM snapshot ${snapshot}`);
    return new EvmCheckpoint(snapshot);
  }

  async revertTo(log = false) {
    const ok = await ethers.provider.send('evm_revert', [this.snapshot]);
    if (!ok) {
      throw new Error(`Error reverting to EVM snapshot ${this.snapshot}`);
    }
    if (log) console.log(`Reverted to EVM snapshot ${this.snapshot}`);
    this.snapshot = await ethers.provider.send('evm_snapshot', []);
    if (log) console.log(`Captured EVM snapshot ${this.snapshot}`);
  }
}
