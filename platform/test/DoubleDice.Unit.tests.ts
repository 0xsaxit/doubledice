import chai, { expect } from 'chai';
import chaiSubset from 'chai-subset';
import { BigNumber, BigNumberish } from 'ethers';
import { ethers } from 'hardhat';
import {
  deployAndInitialize,
  DoubleDicePlatformHelper,
  DUMMY_METADATA,
  EvmCheckpoint,
  findContractEventArgs,
  findUserCommitmentEventArgs,
  generateRandomVirtualFloorId,
  SignerWithAddress,
  timestampMinuteCeil,
  UserCommitment,
  VirtualFloorResolution
} from '../helpers';
import {
  DoubleDice,
  DummyUSDCoin,
  DummyUSDCoin__factory,
  DummyWrappedBTC,
  VirtualFloorCreationParamsStruct,
  VirtualFloorState
} from '../lib/contracts';

chai.use(chaiSubset);

const toTimestamp = (datetime: string | number): BigNumber =>
  BigNumber.from(Math.trunc(new Date(datetime).getTime() / 1000));

const setNextBlockTimestamp = async (timestampOrDatetime: string | number) => {
  const timestamp = typeof timestampOrDatetime === 'string' ? toTimestamp(timestampOrDatetime).toNumber() : timestampOrDatetime;
  await ethers.provider.send('evm_setNextBlockTimestamp', [timestamp]);
};

function tokenIdOf({
  virtualFloorId,
  outcomeIndex,
  datetime,
}: {
  virtualFloorId: string;
  outcomeIndex: number;
  datetime: string;
}): BigNumber {
  return BigNumber.from(
    ethers.utils.solidityKeccak256(
      ['bytes32', 'uint8', 'uint256'],
      [virtualFloorId, outcomeIndex, toTimestamp(datetime)]
    )
  );
}

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

  describe('Create Virtual Floor', function () {
    const virtualFloorId =
      '0x0000000000000000000000000000000000000000000000000123450000000000';
    const tOpen = toTimestamp('2022-06-01T12:00:00');
    const tClose = toTimestamp('2032-01-01T12:00:00');
    const tResolve = toTimestamp('2032-01-02T00:00:00');
    const nOutcomes = 3;
    const betaOpen_e18 = BigNumber.from(10)
      .pow(18)
      .mul(13); // 1 unit per hour

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

    it('Should revert if time closure for vpf used in the past', async function () {
      const pastTOpenTime = toTimestamp('2020-01-01T11:00:00');
      const pastClosureTime = toTimestamp('2021-01-01T12:00:00');
      await expect(
        contract.createVirtualFloor({
          ...virtualFloorCreationParams,
          tOpen: pastTOpenTime,
          tClose: pastClosureTime,
          paymentToken: paymentTokenAddress,
        })
      ).to.be.reverted;
    });

    it('Should revert if resolve time used in the past', async function () {
      const pastResolveTime = toTimestamp('2021-01-01T12:00:00');
      await expect(
        contract.createVirtualFloor({
          ...virtualFloorCreationParams,
          tResolve: pastResolveTime,
          paymentToken: paymentTokenAddress,
        })
      ).to.be.reverted;
    });

    it('Should revert if closure time is later than resolve time', async function () {
      const greaterThanResolveTime = toTimestamp('2032-01-03T00:00:00');
      await expect(
        contract.createVirtualFloor({
          ...virtualFloorCreationParams,
          tClose: greaterThanResolveTime,
          paymentToken: paymentTokenAddress,
        })
      ).to.be.reverted;
    });

    it('Should revert if outcome provided is less than 2', async function () {
      await expect(
        contract.createVirtualFloor({
          ...virtualFloorCreationParams,
          nOutcomes: 1,
          paymentToken: paymentTokenAddress,
        })
      ).to.be.revertedWith('Error: nOutcomes < 2');
    });

    it('Should revert if betaOpen is greater than 1e18', async function () {
      const betaOpenGreaterThan1e18 = BigNumber.from(1).pow(19);

      const _virtualFloorId = generateRandomVirtualFloorId();

      await expect(
        contract.createVirtualFloor({
          ...virtualFloorCreationParams,
          virtualFloorId: _virtualFloorId,
          betaOpen_e18: betaOpenGreaterThan1e18,
          paymentToken: paymentTokenAddress,
        })
      ).to.be.revertedWith('Error: betaOpen < 1.0');
    });

    it('Should revert when beta is equal to 1e18', async function () {
      const betaOpenGreaterThan1e18 = BigNumber.from(1).pow(18);
      await expect(
        contract.createVirtualFloor({
          ...virtualFloorCreationParams,
          betaOpen_e18: betaOpenGreaterThan1e18,
          paymentToken: paymentTokenAddress,
        })
      ).to.be.revertedWith('Error: betaOpen < 1.0');
    });

    it('Assert tOpen tClose & tResolve are multiples of time slot-duration', async function () {
      await expect(
        contract.createVirtualFloor({
          ...virtualFloorCreationParams,
          tClose: tClose.add(1),
          paymentToken: paymentTokenAddress,
        })
      ).to.be.revertedWith('Error: tClose % _TIMESLOT_DURATION != 0');

      await expect(
        contract.createVirtualFloor({
          ...virtualFloorCreationParams,
          tOpen: tOpen.add(1),
          paymentToken: paymentTokenAddress,
        })
      ).to.be.revertedWith('Error: tOpen % _TIMESLOT_DURATION != 0');

      await expect(
        contract.createVirtualFloor({
          ...virtualFloorCreationParams,
          tResolve: tResolve.add(1),
          paymentToken: paymentTokenAddress,
        })
      ).to.be.revertedWith('Error: tResolve % _TIMESLOT_DURATION != 0');
    });

    // We can not test this on a test evm since transaction get mined almost instantly
    it.skip('Assert creation to happen up to 10% into the open period', async function () {
      const _tOpen = toTimestamp('2022-06-01T11:01:00');
      const _tClose = toTimestamp('2022-06-01T11:02:00');

      await expect(
        contract.createVirtualFloor({
          ...virtualFloorCreationParams,
          tOpen: _tOpen,
          tClose: _tClose,
          paymentToken: paymentTokenAddress,
        })
      ).to.be.revertedWith('Error: t >= 10% into open period');
    });

    it.skip('Should mint 1 virtual Id based token to owner', async function () {
      const { events } = await (
        await contract.createVirtualFloor({
          ...virtualFloorCreationParams,
          paymentToken: paymentTokenAddress,
        })
      ).wait();

      const virtualFloorIdBasedTokenBalance = await contract.balanceOf(
        ownerSigner.address,
        virtualFloorId
      );
      expect(virtualFloorIdBasedTokenBalance).to.eq(BigNumber.from(1));
    });

    it('Should create VF if right arguments passed', async function () {
      const _virtualFloorId = generateRandomVirtualFloorId();

      const { events } = await (
        await contract.createVirtualFloor({
          ...virtualFloorCreationParams,
          virtualFloorId: _virtualFloorId,
          paymentToken: paymentTokenAddress,
        })
      ).wait();

      const virtualFloorCreationEventArgs = findContractEventArgs(
        events,
        'VirtualFloorCreation'
      );
      expect(virtualFloorCreationEventArgs.virtualFloorId).to.eq(
        BigNumber.from(_virtualFloorId)
      );
    });

    it('Should revert if VF with same id created before', async function () {
      const params: VirtualFloorCreationParamsStruct = {
        ...virtualFloorCreationParams,
        paymentToken: paymentTokenAddress,
      };
      await (await contract.createVirtualFloor(params)).wait();
      await expect(contract.createVirtualFloor(params)).to.be.revertedWith('MARKET_DUPLICATE');
    });
  });
  describe('Commit To Virtual Floor', function () {
    // Random virtual floor for each test case
    let virtualFloorId: BigNumberish;
    const tOpen = toTimestamp('2022-06-01T12:00:00');
    const tClose = toTimestamp('2032-01-01T12:00:00');
    const tResolve = toTimestamp('2032-01-02T00:00:00');
    const nOutcomes = 3;
    const betaOpen_e18 = BigNumber.from(10)
      .pow(18)
      .mul(13); // 1 unit per hour

    const outcomeIndex = 0;
    const amount = $(10);

    let virtualFloorCreationParams: VirtualFloorCreationParamsStruct;

    beforeEach(async () => {
      // Mint 1000$ to each user
      await helper.mintTokensForUser({
        token,
        ownerSigner,
        userAddress: user1Signer.address,
        amount: $(1000),
      });
      await helper.mintTokensForUser({
        token,
        ownerSigner,
        userAddress: user2Signer.address,
        amount: $(1000),
      });
      await helper.mintTokensForUser({
        token,
        ownerSigner,
        userAddress: user3Signer.address,
        amount: $(1000),
      });

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

      virtualFloorId = generateRandomVirtualFloorId();

      virtualFloorCreationParams = {
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

      await (
        await contract.createVirtualFloor({
          ...virtualFloorCreationParams,
          paymentToken: paymentTokenAddress,
        })
      ).wait();
    });

    it('Should revert if virtualFloorId doesn’t exist', async function () {
      const randomVirtualFloorId = '0x00000000000000000000000000000000000000000000000000dead0000000000';
      const outcomeIndex = 0;
      const amount = $(10);

      await expect(
        contract
          .connect(user1Signer)
          .commitToVirtualFloor(randomVirtualFloorId, outcomeIndex, amount)
      ).to.be.revertedWith('MARKET_NOT_FOUND');
    });

    it('Should revert if virtual Floor is closed', async function () {
      const checkpoint = await EvmCheckpoint.create();
      await setNextBlockTimestamp('2032-01-01T13:00:00');

      await expect(
        contract
          .connect(user1Signer)
          .commitToVirtualFloor(virtualFloorId, outcomeIndex, amount)
      ).to.be.revertedWith('MARKET_CLOSED');
      await checkpoint.revertTo();
    });

    it('Should revert if outcome index provided is out of options set for VF', async function () {
      const wrongOutComeIndex = 3;
      await expect(
        contract
          .connect(user1Signer)
          .commitToVirtualFloor(virtualFloorId, wrongOutComeIndex, amount)
      ).to.be.revertedWith('OUTCOME_INDEX_OUT_OF_RANGE');
    });

    it('Should revert if amount is zero or less', async function () {
      const wrongAmount = $(0);
      await expect(
        contract
          .connect(user1Signer)
          .commitToVirtualFloor(virtualFloorId, outcomeIndex, wrongAmount)
      ).to.be.revertedWith('AMOUNT_ZERO');
    });

    it('Should revert if enough allowance was not granted', async function () {
      const amountBiggerThanAllowance = $(200);
      await expect(
        contract
          .connect(user1Signer)
          .commitToVirtualFloor(
            virtualFloorId,
            outcomeIndex,
            amountBiggerThanAllowance
          )
      ).to.be.revertedWith('ERC20: insufficient allowance');
    });

    it('Should commit successfully if right parameters passed and as well emit right event with right parameters', async function () {
      const { events } = await (
        await contract
          .connect(user1Signer)
          .commitToVirtualFloor(virtualFloorId, outcomeIndex, amount)
      ).wait();

      const userCommitmentEventArgs = findUserCommitmentEventArgs(events);

      expect(userCommitmentEventArgs.virtualFloorId).to.eq(virtualFloorId);
      expect(userCommitmentEventArgs.outcomeIndex).to.eq(outcomeIndex);
      expect(userCommitmentEventArgs.amount).to.eq(amount);
    });

    it('Should transfer the amount to the contract address', async function () {
      const balanceOfContractBeforeCommit = await token.balanceOf(
        contract.address
      );
      await (
        await contract
          .connect(user1Signer)
          .commitToVirtualFloor(virtualFloorId, outcomeIndex, amount)
      ).wait();
      const balanceOfContractAfterCommit = await token.balanceOf(
        contract.address
      );
      expect(
        balanceOfContractAfterCommit.sub(balanceOfContractBeforeCommit)
      ).to.be.eq(amount);
    });

    it('Should increase the VF aggregate commitment by the amount', async function () {
      const aggregateBalanceBeforeCommit = await contract.getVirtualFloorAggregateCommitments(
        virtualFloorId,
        outcomeIndex
      );
      await (
        await contract
          .connect(user1Signer)
          .commitToVirtualFloor(virtualFloorId, outcomeIndex, amount)
      ).wait();
      const aggregateBalanceAfterCommit = await contract.getVirtualFloorAggregateCommitments(
        virtualFloorId,
        outcomeIndex
      );
      expect(
        aggregateBalanceAfterCommit.amount.sub(
          aggregateBalanceBeforeCommit.amount
        )
      ).to.be.eq(amount);
    });

    it('Should generate same token ID if the commitment is before open time', async function () {
      const localCheckpoint = await EvmCheckpoint.create();

      await setNextBlockTimestamp(tOpen.toNumber() - 10 * 60);

      const { events: commitment1Events } = await (
        await contract
          .connect(user1Signer)
          .commitToVirtualFloor(virtualFloorId, outcomeIndex, amount)
      ).wait();
      const commitment1EventArgs = findUserCommitmentEventArgs(
        commitment1Events
      );

      await setNextBlockTimestamp(tOpen.toNumber() - 5 * 60);

      const { events: commitment2Events } = await (
        await contract
          .connect(user1Signer)
          .commitToVirtualFloor(virtualFloorId, outcomeIndex, amount)
      ).wait();
      const commitment2EventArgs = findUserCommitmentEventArgs(
        commitment2Events
      );

      expect(commitment2EventArgs.tokenId).to.be.eq(
        commitment1EventArgs.tokenId
      );

      await localCheckpoint.revertTo();
    });

    it('Should generate unique token id for the granularity level of time slot duration after open time', async function () {
      const virtualFloorId1 = generateRandomVirtualFloorId();

      const { timestamp } = await ethers.provider.getBlock('latest');

      const _tOpen = timestampMinuteCeil(timestamp + 60);
      const tCommitment1 = timestampMinuteCeil(_tOpen + 3 * 60);
      const tCommitment2 = timestampMinuteCeil(_tOpen + 6 * 60);

      await (
        await contract.createVirtualFloor({
          ...virtualFloorCreationParams,
          virtualFloorId: virtualFloorId1,
          tOpen: _tOpen,
          paymentToken: paymentTokenAddress,
        })
      ).wait();


      await setNextBlockTimestamp(tCommitment1);

      const { events: commitment1Events, blockHash: blockHash1 } = await (
        await contract
          .connect(user1Signer)
          .commitToVirtualFloor(virtualFloorId1, outcomeIndex, amount)
      ).wait();
      const commitment1EventArgs = findUserCommitmentEventArgs(
        commitment1Events
      );

      expect((await ethers.provider.getBlock(blockHash1)).timestamp).to.eq(tCommitment1);


      await setNextBlockTimestamp(tCommitment2);

      const { events: commitment2Events, blockHash: blockHash2 } = await (
        await contract
          .connect(user1Signer)
          .commitToVirtualFloor(virtualFloorId1, outcomeIndex, amount)
      ).wait();
      const commitment2EventArgs = findUserCommitmentEventArgs(
        commitment2Events
      );

      expect((await ethers.provider.getBlock(blockHash2)).timestamp).to.eq(tCommitment2);


      expect(commitment2EventArgs.tokenId).to.be.not.eq(
        commitment1EventArgs.tokenId
      );
    });

    it('Should revert if the amount passed is more than the limit uint256', async function () {
      const amountExceedUint256Limit = 2n ** 256n + 1n;

      await expect(
        contract
          .connect(user1Signer)
          .commitToVirtualFloor(
            virtualFloorId,
            outcomeIndex,
            amountExceedUint256Limit
          )
      ).to.be.reverted;
    });

    it('Should revert if the weighted amount passed the max limit of uint256', async function () {
      const amountExceedUint256Limit = 2n ** 256n;

      await expect(
        contract
          .connect(user1Signer)
          .commitToVirtualFloor(
            virtualFloorId,
            outcomeIndex,
            amountExceedUint256Limit
          )
      ).to.be.reverted;
    });

    it('Should mint token commitment for the user', async function () {
      const { events } = await (
        await contract
          .connect(user1Signer)
          .commitToVirtualFloor(virtualFloorId, outcomeIndex, amount)
      ).wait();
      const userCommitmentEventArgs = findUserCommitmentEventArgs(events);

      const mintedTokenAmount = await contract.balanceOf(
        user1Signer.address,
        userCommitmentEventArgs.tokenId
      );
      expect(mintedTokenAmount).to.be.eq(amount);
    });
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

  describe('PaymentTokenRegistry & URI test', function () {
    //
  });

  describe('Fee related tests', function () {
    let virtualFloorId: BigNumberish;
    const betaOpen_e18 = BigNumber.from(10)
      .pow(18)
      .mul(13); // 1 unit per hour
    const tOpen = toTimestamp('2022-06-01T10:00:00');
    const tClose = toTimestamp('2032-01-01T10:00:00');
    const tResolve = toTimestamp('2032-01-02T00:00:00');
    const nOutcomes = 3;

    let virtualFloorCreationParams: VirtualFloorCreationParamsStruct;

    beforeEach(async () => {
      // Random virtual floor for each test case
      virtualFloorId = generateRandomVirtualFloorId();
      virtualFloorCreationParams = {
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
      await (
        await contract.createVirtualFloor({
          ...virtualFloorCreationParams,
          paymentToken: paymentTokenAddress,
        })
      ).wait();
    });

    it('Users of equal commitment should get equal share', async () => {
      const checkpoint = await EvmCheckpoint.create();
      const amountToCommit = $(100);

      await helper.mintTokenAndGiveAllowanceToContract({
        mintAmount: amountToCommit,
        allowanceAmount: amountToCommit,
        contractAddress: contract.address,
        ownerSigner,
        usersSigner: [user1Signer, user2Signer, user3Signer],
        token
      });

      // winners commitment
      const user1CommitmentEventArgs: UserCommitment = await helper.commitToVirtualFloor(virtualFloorId, 1, user1Signer, amountToCommit);
      const user2CommitmentEventArgs: UserCommitment = await helper.commitToVirtualFloor(virtualFloorId, 1, user2Signer, amountToCommit);

      // loser commitment
      await helper.commitToVirtualFloor(virtualFloorId, 0, user3Signer, amountToCommit);


      await setNextBlockTimestamp(tResolve.toNumber() * 10e3);

      const resolutionEvent: VirtualFloorResolution = await helper.resolveVirtualFloor(virtualFloorId, 1, ownerSigner);

      const user1BalanceBeforeClaim = await token.balanceOf(user1Signer.address);
      const user2BalanceBeforeClaim = await token.balanceOf(user1Signer.address);

      await helper.claim(virtualFloorId, 1, user1Signer, user1CommitmentEventArgs.timeslot);
      await helper.claim(virtualFloorId, 1, user2Signer, user2CommitmentEventArgs.timeslot);

      const user1BalanceAfterClaim = await token.balanceOf(user1Signer.address);
      const user2BalanceAfterClaim = await token.balanceOf(user1Signer.address);

      const collectedFee = await token.balanceOf(await contract.platformFeeBeneficiary());

      const user1Profit = user1BalanceAfterClaim.sub(user1BalanceBeforeClaim);
      const user2Profit = user2BalanceAfterClaim.sub(user2BalanceBeforeClaim);

      expect(collectedFee).to.be.eq(resolutionEvent.platformFeeAmount);

      // Assert loser commitment is equal to winners profit + fee
      expect(amountToCommit).to.be.eq(
        resolutionEvent.winnerProfits
          .add(resolutionEvent.platformFeeAmount)
          .add(resolutionEvent.ownerFeeAmount)
      );

      expect(user1Profit).to.be.gt(0);
      expect(user1Profit).to.be.eq(user2Profit);
      await checkpoint.revertTo();
    });


    it('Time span should affect only same amount after vf open time', async () => {
      const amountToCommit = $(100000000000);

      await helper.mintTokenAndGiveAllowanceToContract({
        mintAmount: amountToCommit,
        allowanceAmount: amountToCommit,
        contractAddress: contract.address,
        ownerSigner,
        usersSigner: [user1Signer, user2Signer, user3Signer, user4Signer],
        token
      });


      // set to open time
      await setNextBlockTimestamp('2022-06-01T10:00:00');
      // winners commitment
      const user1CommitmentEventArgs: UserCommitment = await helper.commitToVirtualFloor(virtualFloorId, 1, user1Signer, amountToCommit);
      console.log('Timeslot duration', await contract.TIMESLOT_DURATION());
      await setNextBlockTimestamp('2028-06-01T10:00:00');
      const user2CommitmentEventArgs: UserCommitment = await helper.commitToVirtualFloor(virtualFloorId, 1, user2Signer, amountToCommit);
      await setNextBlockTimestamp('2029-06-01T10:00:00');
      const user3CommitmentEventArgs: UserCommitment = await helper.commitToVirtualFloor(virtualFloorId, 1, user3Signer, amountToCommit);

      console.log('user1 commitment', user1CommitmentEventArgs.timeslot.toNumber());
      console.log('user2 commitment', user2CommitmentEventArgs.timeslot.toNumber());
      console.log('user3 commitment', user3CommitmentEventArgs.timeslot.toNumber());

      console.log('\n beta commitment', user1CommitmentEventArgs.beta_e18);
      console.log('bata commitment', user3CommitmentEventArgs.beta_e18);

      // loser commitment
      await helper.commitToVirtualFloor(virtualFloorId, 0, user4Signer, amountToCommit);


      expect(user3CommitmentEventArgs.tokenId).to.not.be.eq(user1CommitmentEventArgs.tokenId);
      expect(user3CommitmentEventArgs.beta_e18).to.not.be.eq(user1CommitmentEventArgs.beta_e18);

      await setNextBlockTimestamp('2032-01-02T00:00:00');
      const resolutionEvent: VirtualFloorResolution = await helper.resolveVirtualFloor(virtualFloorId, 1, ownerSigner);

      const user1BalanceBeforeClaim = await token.balanceOf(user1Signer.address);
      const user2BalanceBeforeClaim = await token.balanceOf(user1Signer.address);

      await helper.claim(virtualFloorId, 1, user1Signer, user1CommitmentEventArgs.timeslot);
      await helper.claim(virtualFloorId, 1, user2Signer, user2CommitmentEventArgs.timeslot);
      await helper.claim(virtualFloorId, 1, user3Signer, user3CommitmentEventArgs.timeslot);

      const user1BalanceAfterClaim = await token.balanceOf(user1Signer.address);
      const user2BalanceAfterClaim = await token.balanceOf(user1Signer.address);

      const collectedFee = await token.balanceOf(await contract.platformFeeBeneficiary());

      const user1Profit = user1BalanceAfterClaim.sub(user1BalanceBeforeClaim);
      console.log('user1Profit', user1Profit);
      const user2Profit = user2BalanceAfterClaim.sub(user2BalanceBeforeClaim);
      console.log('user2Profit', user2Profit);

      expect(collectedFee).to.be.eq(resolutionEvent.platformFeeAmount);

      // Assert loser commitment is equal to winners profit + fee
      expect(amountToCommit).to.be.eq(
        resolutionEvent.winnerProfits
          .add(resolutionEvent.platformFeeAmount)
          .add(resolutionEvent.ownerFeeAmount)
      );

      expect(user1Profit).to.be.gt(0);
      expect(user1Profit).to.be.eq(user2Profit);

    });

  });

});
