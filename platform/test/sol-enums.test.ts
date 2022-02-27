import { expect } from 'chai';
import { Signer } from 'ethers';
import { ethers } from 'hardhat';
import {
  CommitmentBalanceTransferRejectionCause,
  CommitmentBalanceTransferRejectionCauseWrapper__factory,
  VirtualFloorResolutionType,
  VirtualFloorResolutionTypeWrapper__factory,
  VirtualFloorState,
  VirtualFloorStateWrapper__factory
} from '../lib/contracts';

describe('Check manual Solidity-enum-type TypeScript analogs against actual values', () => {

  let signer: Signer;

  before(async () => {
    [signer] = await ethers.getSigners();
  });

  it('VirtualFloorState', async () => {
    const lib = await new VirtualFloorStateWrapper__factory(signer).deploy();
    await lib.deployed();
    expect(VirtualFloorState.None).to.eq(await lib.None());
    expect(VirtualFloorState.Running).to.eq(await lib.Running());
    expect(VirtualFloorState.ClosedUnresolvable).to.eq(await lib.ClosedUnresolvable());
    expect(VirtualFloorState.ClosedPreResolvable).to.eq(await lib.ClosedPreResolvable());
    expect(VirtualFloorState.ClosedResolvable).to.eq(await lib.ClosedResolvable());
    expect(VirtualFloorState.ResolvedWinners).to.eq(await lib.ResolvedWinners());
    expect(VirtualFloorState.CancelledResolvedNoWinners).to.eq(await lib.CancelledResolvedNoWinners());
    expect(VirtualFloorState.CancelledUnresolvable).to.eq(await lib.CancelledUnresolvable());
    expect(VirtualFloorState.CancelledFlagged).to.eq(await lib.CancelledFlagged());
  });

  it('VirtualFloorResolutionType', async () => {
    const lib = await new VirtualFloorResolutionTypeWrapper__factory(signer).deploy();
    await lib.deployed();
    expect(VirtualFloorResolutionType.CancelledNoWinners).to.eq(await lib.CancelledNoWinners());
    expect(VirtualFloorResolutionType.Winners).to.eq(await lib.Winners());
  });

  it('CommitmentBalanceTransferRejectionCause', async () => {
    const lib = await new CommitmentBalanceTransferRejectionCauseWrapper__factory(signer).deploy();
    await lib.deployed();
    expect(CommitmentBalanceTransferRejectionCause.WrongState).to.eq(await lib.WrongState());
    expect(CommitmentBalanceTransferRejectionCause.TooLate).to.eq(await lib.TooLate());
    expect(CommitmentBalanceTransferRejectionCause.VirtualFloorUnresolvable).to.eq(await lib.VirtualFloorUnresolvable());
  });

});
