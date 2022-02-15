import chai, { expect } from 'chai';
import chaiSubset from 'chai-subset';
import { BigNumber, BigNumberish } from 'ethers';
import { ethers } from 'hardhat';
import {
  deployAndInitialize,
  DoubleDicePlatformHelper,
  DUMMY_METADATA,
  EvmCheckpoint,
  generateRandomVirtualFloorId,
  SignerWithAddress,
  UserCommitment
} from '../../helpers';
import {
  DoubleDice,
  DummyUSDCoin,
  DummyUSDCoin__factory,
  DummyWrappedBTC,
  VirtualFloorCreationParamsStruct,
  VirtualFloorState
} from '../../lib/contracts';

chai.use(chaiSubset);

const toTimestamp = (datetime: string | number): BigNumber =>
  BigNumber.from(Math.trunc(new Date(datetime).getTime() / 1000));

const setNextBlockTimestamp = async (timestampOrDatetime: string | number) => {
  const timestamp = typeof timestampOrDatetime === 'string' ? toTimestamp(timestampOrDatetime).toNumber() : timestampOrDatetime;
  await ethers.provider.send('evm_setNextBlockTimestamp', [timestamp]);
};

const $ = (dollars: BigNumberish, millionths: BigNumberish = 0): BigNumber =>
  BigNumber.from(1000000)
    .mul(dollars)
    .add(millionths);

let helper: DoubleDicePlatformHelper;

const creationFeeRate_e18 = 50000_000000_000000n; // 0.05 = 5%

describe('DoubleDice', function () {
  let ownerSigner: SignerWithAddress;
  let platformFeeBeneficiarySigner: SignerWithAddress;
  let user1Signer: SignerWithAddress;
  let user2Signer: SignerWithAddress;
  let user3Signer: SignerWithAddress;
  let user4Signer: SignerWithAddress;
  let contract: DoubleDice;
  let token: DummyUSDCoin | DummyWrappedBTC;
  let paymentTokenAddress: string;

  before(async function () {
    [
      ownerSigner,
      platformFeeBeneficiarySigner,
      user1Signer,
      user2Signer,
      user3Signer,
      user4Signer,
    ] = await ethers.getSigners();

    // Deploy USDC Token
    token = await new DummyUSDCoin__factory(ownerSigner).deploy();
    await token.deployed();

    contract = await deployAndInitialize(ownerSigner, {
      FEE_BENEFICIARY_ADDRESS: platformFeeBeneficiarySigner.address,
      platformFeeRate_e18: 500000_000000_000000n, // 50%
    });

    expect(await contract.platformFeeRate_e18()).to.eq(500000_000000_000000n);

    helper = new DoubleDicePlatformHelper(contract);

    // Assert fee beneficiary
    expect(await contract.platformFeeBeneficiary()).to.eq(platformFeeBeneficiarySigner.address);

    {
      expect(
        await contract.isPaymentTokenWhitelisted(token.address)
      ).to.be.false;
      await (
        await contract
          .connect(ownerSigner)
          .updatePaymentTokenWhitelist(token.address, true)
      ).wait();
      expect(
        await contract.isPaymentTokenWhitelisted(token.address)
      ).to.be.true;
      paymentTokenAddress = token.address;
    }
  });

  describe('Resolve Virtual Floor', function () {
    // Random virtual floor for each test case
    const virtualFloorId = generateRandomVirtualFloorId();
    const virtualFloorId2 = generateRandomVirtualFloorId();
    const allWinnersVf = generateRandomVirtualFloorId();
    const tOpen = toTimestamp('2022-06-01T12:00:00');
    const tClose = toTimestamp('2032-01-01T12:00:00');
    const tResolve = toTimestamp('2032-01-02T00:00:00');
    const nOutcomes = 3;
    const betaOpen_e18 = BigNumber.from(10)
      .pow(18)
      .mul(13); // 1 unit per hour

    let user1CommitmentEventArgs: UserCommitment;
    let user2CommitmentEventArgs: UserCommitment;
    let user3CommitmentEventArgs: UserCommitment;

    const virtualFloorCreationParams: VirtualFloorCreationParamsStruct = {
      virtualFloorId,
      tOpen,
      tClose,
      tResolve,
      nOutcomes,
      betaOpen_e18,
      creationFeeRate_e18,
      paymentToken: paymentTokenAddress,
      metadata: DUMMY_METADATA,
    };

    before(async () => {
      // Mint 1000$ to each user
      await (
        await token.connect(ownerSigner).mint(user1Signer.address, $(1000))
      ).wait();
      await (
        await token.connect(ownerSigner).mint(user2Signer.address, $(1000))
      ).wait();
      await (
        await token.connect(ownerSigner).mint(user3Signer.address, $(1000))
      ).wait();

      // Allow the contract to transfer up to 100$ from each user
      await (
        await token.connect(user1Signer).approve(contract.address, $(100))
      ).wait();
      await (
        await token.connect(user2Signer).approve(contract.address, $(100))
      ).wait();
      await (
        await token.connect(user3Signer).approve(contract.address, $(100))
      ).wait();

      await (
        await contract.createVirtualFloor({
          ...virtualFloorCreationParams,
          paymentToken: paymentTokenAddress,
        })
      ).wait();
      await (
        await contract.createVirtualFloor({
          ...virtualFloorCreationParams,
          virtualFloorId: virtualFloorId2,
          paymentToken: paymentTokenAddress,
        })
      ).wait();
      await (
        await contract.createVirtualFloor({
          ...virtualFloorCreationParams,
          virtualFloorId: allWinnersVf,
          paymentToken: paymentTokenAddress,
        })
      ).wait();

      user1CommitmentEventArgs = await helper.commitToVirtualFloor(virtualFloorId, 0, user1Signer, $(10));
      user2CommitmentEventArgs = await helper.commitToVirtualFloor(virtualFloorId, 1, user2Signer, $(10));
      user3CommitmentEventArgs = await helper.commitToVirtualFloor(virtualFloorId, 1, user3Signer, $(10));

      await helper.commitToVirtualFloor(allWinnersVf, 1, user1Signer, $(10));
      await helper.commitToVirtualFloor(allWinnersVf, 1, user2Signer, $(10));
      await helper.commitToVirtualFloor(allWinnersVf, 1, user3Signer, $(10));
    });

    it('Should revert if VF / market does not exist', async function () {
      const wrongVirtualFloorId =
        '0x00000000000000000000000000000000000000000000000000dead0000000000';
      await expect(contract.resolve(wrongVirtualFloorId, 1)).to.be.revertedWith(
        'MARKET_INEXISTENT_OR_IN_WRONG_STATE'
      );
    });

    it('Should revert if resolve time has not reached', async function () {

      // Commit to 2 outcomes so that VF resolution fails because too early,
      // and not because it is unresolvable.
      await (await contract.connect(user1Signer).commitToVirtualFloor(virtualFloorId2, 0, 1)).wait();
      await (await contract.connect(user2Signer).commitToVirtualFloor(virtualFloorId2, 1, 1)).wait();

      await expect(contract.resolve(virtualFloorId2, 1)).to.be.revertedWith(
        'TOO_EARLY_TO_RESOLVE'
      );
    });

    it('Should revert if the provided outcome index is out of the VF outcomes', async function () {
      const checkpoint = await EvmCheckpoint.create();
      await setNextBlockTimestamp(tResolve.toNumber() * 10e3);

      await expect(contract.resolve(virtualFloorId2, 4)).to.be.revertedWith(
        'OUTCOME_INDEX_OUT_OF_RANGE'
      );
      await checkpoint.revertTo();
    });

    it('Should revert if VF is already on resolved state', async function () {
      const checkpoint = await EvmCheckpoint.create();
      await setNextBlockTimestamp(tResolve.toNumber() * 10e3);
      await (await contract.resolve(virtualFloorId2, 1)).wait();

      await expect(contract.resolve(virtualFloorId2, 1)).to.be.revertedWith(
        'MARKET_INEXISTENT_OR_IN_WRONG_STATE'
      );
      await checkpoint.revertTo();
    });

    it('Should cancel VF and set resolution type to No Winners when total commitments for the resolution index is 0', async function () {
      const checkpoint = await EvmCheckpoint.create();
      const vfAggregateCommitments = await contract.getVirtualFloorAggregateCommitments(
        virtualFloorId,
        2
      );
      expect(vfAggregateCommitments.amount).to.be.eq(0);

      await setNextBlockTimestamp(tResolve.toNumber() * 10e3);
      await (await contract.resolve(virtualFloorId, 2)).wait();

      const virtualFloor = await contract._virtualFloors(virtualFloorId);

      expect(virtualFloor.state).to.be.eq(VirtualFloorState.CancelledResolvedNoWinners);
      await checkpoint.revertTo();
    });

    it('Should cancel VF and set resolution type to All Winners when total commits of the VF is equal to winner commitments', async function () {
      const checkpoint = await EvmCheckpoint.create();
      const vfAggregateCommitments = await contract.getVirtualFloorAggregateCommitments(
        allWinnersVf,
        1
      );
      expect(vfAggregateCommitments.amount).to.be.eq($(10).mul(3));

      await setNextBlockTimestamp(tResolve.toNumber() * 10e3);

      await expect(contract.resolve(allWinnersVf, 1)).to.be.revertedWith('Error: Cannot resolve VF with commitments to less than 2 outcomes');

      await (await contract.cancelVirtualFloorUnresolvable(allWinnersVf)).wait();

      const virtualFloor = await contract._virtualFloors(allWinnersVf);
      expect(virtualFloor.state).to.be.eq(VirtualFloorState.CancelledUnresolvable);
      await checkpoint.revertTo();
    });

    it('Should set VF state to completed as well resolution type to some winners and set winnerProfits also transfer to the feeBeneficary the fee amount', async function () {
      const checkpoint = await EvmCheckpoint.create();
      const balanceOfFeeBeneficaryBefore = await token.balanceOf(
        platformFeeBeneficiarySigner.address
      );

      await setNextBlockTimestamp(tResolve.toNumber() * 10e3);
      await (await contract.resolve(virtualFloorId, 1)).wait();

      const balanceOfFeeBeneficaryAfter = await token.balanceOf(
        platformFeeBeneficiarySigner.address
      );

      const virtualFloor = await contract._virtualFloors(virtualFloorId);
      expect(virtualFloor.state).to.be.eq(VirtualFloorState.ResolvedWinners);

      expect(balanceOfFeeBeneficaryAfter.toNumber()).to.be.gt(
        balanceOfFeeBeneficaryBefore.toNumber()
      );
      await checkpoint.revertTo();
    });

    it.skip('Should calculate beta right (WIP)', async () => {
      const checkpoint = await EvmCheckpoint.create();
      await setNextBlockTimestamp(tResolve.toNumber() * 10e3);
      await (await contract.resolve(virtualFloorId, 1)).wait();

      const virtualFloor = await contract._virtualFloors(virtualFloorId);
      expect(virtualFloor.state).to.be.eq(VirtualFloorState.ResolvedWinners);

      // console.log("user1CommitmentEvent", virtualFloor);

      // const vfAggregateCommitments = await contract.getVirtualFloorAggregateCommitments(virtualFloorId, 0);
      // console.log("vfAggregateCommitments", vfAggregateCommitments);
      // const beta = virtualFloor.betaOpen_e18.mul(virtualFloor.tClose - user1CommitmentEvent.args.timeslot);
      // console.log("beta", beta.add(BigNumber.from(1e13)));
      // const weightedAmount = beta.mul(user1CommitmentEvent.args.amount);
      // console.log("weightedAmount", weightedAmount);
      // console.log("weightedAmount", user1CommitmentEvent.args);
      // console.log("difference", vfAggregateCommitments.weightedAmount.sub(weightedAmount).sub(1e13) );
      // uint256 profit = (weightedAmount * virtualFloor.winnerProfits) / virtualFloor.aggregateCommitments[virtualFloor.outcome].weightedAmount;
      await checkpoint.revertTo();
    });
  });
});
