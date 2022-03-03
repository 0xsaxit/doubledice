import { expect } from 'chai';
import { Signer } from 'ethers';
import { ethers } from 'hardhat';
import {
  ResolutionState,
  ResolutionStateWrapper__factory,
  ResultUpdateAction,
  ResultUpdateActionWrapper__factory,
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

  it('ResultUpdateAction', async () => {
    const lib = await new ResultUpdateActionWrapper__factory(signer).deploy();
    await lib.deployed();
    expect(ResultUpdateAction.AdminFinalizedUnsetResult).to.eq(await lib.AdminFinalizedUnsetResult());
    expect(ResultUpdateAction.CreatorSetResult).to.eq(await lib.CreatorSetResult());
    expect(ResultUpdateAction.SomeoneConfirmedUnchallengedResult).to.eq(await lib.SomeoneConfirmedUnchallengedResult());
    expect(ResultUpdateAction.SomeoneChallengedSetResult).to.eq(await lib.SomeoneChallengedSetResult());
    expect(ResultUpdateAction.AdminFinalizedChallenge).to.eq(await lib.AdminFinalizedChallenge());
  });

  it('ResolutionState', async () => {
    const lib = await new ResolutionStateWrapper__factory(signer).deploy();
    await lib.deployed();
    expect(ResolutionState.None).to.eq(await lib.None());
    expect(ResolutionState.Set).to.eq(await lib.Set());
    expect(ResolutionState.Challenged).to.eq(await lib.Challenged());
    expect(ResolutionState.ChallengeCancelled).to.eq(await lib.ChallengeCancelled());
    expect(ResolutionState.Complete).to.eq(await lib.Complete());
  });

});
