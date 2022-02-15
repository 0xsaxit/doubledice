import chai, { expect } from 'chai';
import chaiSubset from 'chai-subset';
import { BigNumber } from 'ethers';
import { ethers } from 'hardhat';
import {
  deployAndInitialize,
  DUMMY_METADATA,
  findContractEventArgs,
  generateRandomVirtualFloorId,
  SignerWithAddress
} from '../../helpers';
import {
  DoubleDice,
  DummyUSDCoin,
  DummyUSDCoin__factory,
  DummyWrappedBTC,
  VirtualFloorCreationParamsStruct,
} from '../../lib/contracts';

chai.use(chaiSubset);

const toTimestamp = (datetime: string | number): BigNumber =>
  BigNumber.from(Math.trunc(new Date(datetime).getTime() / 1000));

const creationFeeRate_e18 = 50000_000000_000000n; // 0.05 = 5%

describe('DoubleDice', function () {
  let ownerSigner: SignerWithAddress;
  let platformFeeBeneficiarySigner: SignerWithAddress;
  let contract: DoubleDice;
  let token: DummyUSDCoin | DummyWrappedBTC;
  let paymentTokenAddress: string;

  before(async function () {
    [
      ownerSigner,
      platformFeeBeneficiarySigner,
    ] = await ethers.getSigners();

    // Deploy USDC Token
    token = await new DummyUSDCoin__factory(ownerSigner).deploy();
    await token.deployed();

    contract = await deployAndInitialize(ownerSigner, {
      FEE_BENEFICIARY_ADDRESS: platformFeeBeneficiarySigner.address,
      platformFeeRate_e18: 500000_000000_000000n, // 50%
    });

    expect(await contract.platformFeeRate_e18()).to.eq(500000_000000_000000n);

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
});
