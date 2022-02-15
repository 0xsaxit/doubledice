import chai, { expect } from 'chai';
import chaiSubset from 'chai-subset';
import { BigNumber, BigNumberish } from 'ethers';
import { ethers } from 'hardhat';
import {
  deployAndInitialize,
  DoubleDicePlatformHelper,
  DUMMY_METADATA,
  EvmCheckpoint,
  findUserCommitmentEventArgs,
  generateRandomVirtualFloorId,
  SignerWithAddress,
  UserCommitment
} from '../../helpers';
import {
  DoubleDice,
  DummyUSDCoin,
  DummyUSDCoin__factory,
  DummyWrappedBTC,
  VirtualFloorCreationParamsStruct
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

  describe('Claim Virtual Floor', function () {
    // Random virtual floor for each test case
    const virtualFloorId = generateRandomVirtualFloorId();
    const virtualFloorId2 = generateRandomVirtualFloorId();
    const allWinnersVf = generateRandomVirtualFloorId();
    const betaOpen_e18 = BigNumber.from(10)
      .pow(18)
      .mul(13); // 1 unit per hour
    const tOpen = toTimestamp('2022-06-01T10:00:00');
    const tClose = toTimestamp('2032-01-01T10:00:00');
    const tResolve = toTimestamp('2032-01-02T00:00:00');
    const nOutcomes = 3;

    let user1CommitmentEventArgs: UserCommitment;
    let user2CommitmentEventArgs: UserCommitment;
    let user3CommitmentEventArgs: UserCommitment;
    const allWinnersVfCommitmentEventArgs: UserCommitment[] = [];

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

      // helper.mintTokenAndGiveAllowanceToContract({
      //
      // })

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

      const { events: user1CommittedEvents } = await (
        await contract
          .connect(user1Signer)
          .commitToVirtualFloor(virtualFloorId, 0, $(10))
      ).wait();
      user1CommitmentEventArgs = findUserCommitmentEventArgs(
        user1CommittedEvents
      );
      const { events: user2CommittedEvents } = await (
        await contract
          .connect(user2Signer)
          .commitToVirtualFloor(virtualFloorId, 1, $(10))
      ).wait();
      user2CommitmentEventArgs = findUserCommitmentEventArgs(
        user2CommittedEvents
      );
      const { events: user3CommittedEvents } = await (
        await contract
          .connect(user3Signer)
          .commitToVirtualFloor(virtualFloorId, 1, $(10))
      ).wait();
      user3CommitmentEventArgs = findUserCommitmentEventArgs(
        user3CommittedEvents
      );

      const { events: user1AllWinCommittedEvents } = await (
        await contract
          .connect(user1Signer)
          .commitToVirtualFloor(allWinnersVf, 1, $(10))
      ).wait();
      allWinnersVfCommitmentEventArgs[0] = findUserCommitmentEventArgs(
        user1AllWinCommittedEvents
      );
      await (
        await contract
          .connect(user2Signer)
          .commitToVirtualFloor(allWinnersVf, 1, $(10))
      ).wait();
      await (
        await contract
          .connect(user3Signer)
          .commitToVirtualFloor(allWinnersVf, 1, $(10))
      ).wait();
    });

    it('Should revert if VF does not exist', async function () {
      const wrongVirtualFloorId =
        '0x00000000000000000000000000000000000000000000000000dead0000000000';
      await expect(
        contract.claim({
          virtualFloorId: wrongVirtualFloorId,
          outcomeIndex: 1,
          timeslot: toTimestamp('2032-01-01T02:00:00'),
        })
      ).to.be.revertedWith('MARKET_NOT_FOUND');
    });

    it('Should revert if VF is on Running / Closed state', async function () {
      await expect(
        contract.connect(user1Signer).claim({
          virtualFloorId,
          outcomeIndex: 1,
          timeslot: toTimestamp('2032-01-01T02:00:00'),
        })
      ).to.be.revertedWith('MARKET_NOT_RESOLVED');
    });

    it('Should revert if the passed outcome index is not the winning outcome', async function () {
      const checkpoint = await EvmCheckpoint.create();
      await setNextBlockTimestamp(tResolve.toNumber() * 10e3);
      await (await contract.resolve(virtualFloorId, 1)).wait();
      await expect(
        contract.connect(user1Signer).claim({
          virtualFloorId,
          outcomeIndex: 0,
          timeslot: toTimestamp('2032-01-01T02:00:00'),
        })
      ).to.be.revertedWith('NOT_WINNING_OUTCOME');
      await checkpoint.revertTo();
    });

    // ToDo: This will no longer work with an all-winners VF,
    // because such VFs can no longer be resolved.
    // Instead, this same test should be run against a VF that get resolved
    // but cancelled because there are *no* winners.
    it.skip('Should be able to claim original committed amount if the VF got cancelled and also transfer the amount to the user and burn the minted tokens', async function () {
      const checkpoint = await EvmCheckpoint.create();
      await setNextBlockTimestamp(tResolve.toNumber() * 10e3);
      await (await contract.resolve(allWinnersVf, 1)).wait();

      const balanceBeforeClaim = await token.balanceOf(user1Signer.address);

      await (
        await contract.connect(user1Signer).claim({
          virtualFloorId: allWinnersVf,
          outcomeIndex: 1,
          timeslot: allWinnersVfCommitmentEventArgs[0].timeslot,
        })
      ).wait();

      const balanceAfterClaim = await token.balanceOf(user1Signer.address);
      expect(balanceAfterClaim).to.be.gt(0);
      expect(balanceAfterClaim.sub(balanceBeforeClaim)).to.be.eq(
        allWinnersVfCommitmentEventArgs[0].amount
      );
      await checkpoint.revertTo();
    });

    // ToDo: This will no longer work with an all-winners VF,
    // because such VFs can no longer be resolved.
    // Instead, this same test should be run against a VF that get resolved
    // but cancelled because there are *no* winners.
    it.skip('Should not be able to claim a transferred commitment', async () => {
      const checkpoint = await EvmCheckpoint.create();
      await setNextBlockTimestamp(tResolve.toNumber() * 10e3);
      await (await contract.resolve(allWinnersVf, 1)).wait();

      const balanceBeforeClaim = await token.balanceOf(user4Signer.address);

      await contract
        .connect(user1Signer)
        .safeTransferFrom(
          user1Signer.address,
          user4Signer.address,
          allWinnersVfCommitmentEventArgs[0].tokenId,
          allWinnersVfCommitmentEventArgs[0].amount,
          '0x0000000000000000000000000000000000000000000000000000000000000000'
        );

      await expect(
        contract.connect(user1Signer).claim({
          virtualFloorId: allWinnersVf,
          outcomeIndex: 1,
          timeslot: allWinnersVfCommitmentEventArgs[0].timeslot,
        })
      ).to.be.revertedWith('ZERO_BALANCE');
      await checkpoint.revertTo();
    });

    // ToDo: This will no longer work with an all-winners VF,
    // because such VFs can no longer be resolved.
    // Instead, this same test should be run against a VF that get resolved
    // but cancelled because there are *no* winners.
    it.skip('Should be able to claim a transferred cancelled commitment same amount as the committed amount', async function () {
      const checkpoint = await EvmCheckpoint.create();
      await setNextBlockTimestamp(tResolve.toNumber() * 10e3);
      await (await contract.resolve(allWinnersVf, 1)).wait();

      const balanceBeforeClaim = await token.balanceOf(user4Signer.address);

      await contract
        .connect(user1Signer)
        .safeTransferFrom(
          user1Signer.address,
          user4Signer.address,
          allWinnersVfCommitmentEventArgs[0].tokenId,
          allWinnersVfCommitmentEventArgs[0].amount,
          '0x0000000000000000000000000000000000000000000000000000000000000000'
        );

      await (
        await contract.connect(user4Signer).claim({
          virtualFloorId: allWinnersVf,
          outcomeIndex: 1,
          timeslot: allWinnersVfCommitmentEventArgs[0].timeslot,
        })
      ).wait();

      const balanceAfterClaim = await token.balanceOf(user4Signer.address);
      expect(balanceAfterClaim).to.be.gt(0);
      expect(balanceAfterClaim.sub(balanceBeforeClaim)).to.be.eq(
        allWinnersVfCommitmentEventArgs[0].amount
      );
      await checkpoint.revertTo();
    });
  });
});
