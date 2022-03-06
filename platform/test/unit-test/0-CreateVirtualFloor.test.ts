import chai, { expect } from 'chai';
import chaiSubset from 'chai-subset';
import { BigNumber } from 'ethers';
import { ethers } from 'hardhat';
import {
  deployDoubleDice,
  deployDummyUSDCoin,
  ENCODED_DUMMY_METADATA,
  findContractEventArgs,
  generateRandomVirtualFloorId,
  SignerWithAddress,
  toFp18,
  toTimestamp
} from '../../helpers';
import {
  DoubleDice,
  DummyUSDCoin,
  DummyWrappedBTC,
  VirtualFloorCreationParamsStruct
} from '../../lib/contracts';

chai.use(chaiSubset);

const creationFeeRate_e18 = 50000_000000_000000n; // 0.05 = 5%

describe('DoubleDice/Create', function () {
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
    token = await deployDummyUSDCoin(ownerSigner);

    contract = await deployDoubleDice({
      deployer: ownerSigner,
      deployArgs: [],
      initializeArgs: [
        {
          tokenMetadataUriTemplate: 'http://localhost:8080/token/{id}',
          platformFeeRate_e18: toFp18(0.50), // 50%
          platformFeeBeneficiary: platformFeeBeneficiarySigner.address
        },
        token.address,
      ]
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
      betaOpen_e18,
      creationFeeRate_e18,
      tOpen,
      tClose,
      tResolve,
      nOutcomes,
      paymentToken: paymentTokenAddress,
      bonusAmount: 0,
      optionalMinCommitmentAmount: 0,
      optionalMaxCommitmentAmount: 0,
      metadata: ENCODED_DUMMY_METADATA,
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

    it('Should revert if closure and resolve time are the same', async function () {
      const closureTime = toTimestamp('2021-01-01T12:00:00');
      const resolveTime = toTimestamp('2021-01-01T12:00:00');
      await expect(
        contract.createVirtualFloor({
          ...virtualFloorCreationParams,
          tClose: closureTime,
          tResolve: resolveTime,
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
      ).to.be.revertedWith('NotEnoughOutcomes()');
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
      ).to.be.revertedWith('BetaOpenTooSmall()');
    });

    it('Should revert when beta is equal to 1e18', async function () {
      const betaOpenGreaterThan1e18 = BigNumber.from(1).pow(18);
      await expect(
        contract.createVirtualFloor({
          ...virtualFloorCreationParams,
          betaOpen_e18: betaOpenGreaterThan1e18,
          paymentToken: paymentTokenAddress,
        })
      ).to.be.revertedWith('BetaOpenTooSmall()');
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
      console.log(`quota = ${await contract.creationQuotas(ownerSigner.address)}`);

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

      console.log(`quota = ${await contract.creationQuotas(ownerSigner.address)}`);

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
      await expect(contract.createVirtualFloor(params)).to.be.revertedWith('DuplicateVirtualFloorId()');
    });
  });

});
