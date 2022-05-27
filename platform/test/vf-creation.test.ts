import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import assert from 'assert';
import chai, { expect } from 'chai';
import chaiSubset from 'chai-subset';
import { BigNumber } from 'ethers';
import { ethers } from 'hardhat';
import {
  decodeEventLogs,
  deployTestCoin,
  findContractEventArgs,
  genDummyMetadata,
  toFp18,
  toTimestamp
} from '../helpers';
import {
  DummyERC20,
  encodeVirtualFloorMetadata,
  SimpleOracle,
  VirtualFloorCreationParamsStruct
} from '../lib/contracts';
import { deploySimpleOracle, setupSnapshotHooks } from './helpers';

chai.use(chaiSubset);

const _MAX_POSSIBLE_BLOCK_TIMESTAMP_DISCREPANCY = 60;
const _MIN_POSSIBLE_T_RESOLVE_MINUS_T_CLOSE = 10 * _MAX_POSSIBLE_BLOCK_TIMESTAMP_DISCREPANCY;

describe('VF creation', function () {

  let deployer: SignerWithAddress;
  let creator: SignerWithAddress;
  let platformFeeBeneficiary: SignerWithAddress;
  let creationParams: VirtualFloorCreationParamsStruct;
  let contract: SimpleOracle;
  let paymentToken: DummyERC20;

  const vfId = BigNumber.from('0x010000000000');
  const tOpen = toTimestamp('2042-01-01T00:00:00Z');
  const tClose = toTimestamp('2042-01-01T01:00:00Z');
  const tResolve = toTimestamp('2042-01-01T02:00:00Z');

  before(async () => {

    [
      deployer,
      platformFeeBeneficiary,
      creator
    ] = await ethers.getSigners();

    paymentToken = await deployTestCoin(deployer, 6);

    creationParams = {
      vfId,
      betaOpen_e18: toFp18(10.0),
      totalFeeRate_e18: toFp18(0.25),
      tOpen,
      tClose,
      tResolve,
      nOutcomes: 3,
      paymentToken: paymentToken.address,
      bonusAmount: 0,
      optionalMinCommitmentAmount: 0,
      optionalMaxCommitmentAmount: 0,
      metadata: encodeVirtualFloorMetadata(genDummyMetadata({ nOutcomes: 3 })),
    };

    const baseParams = {
      tokenMetadataUriTemplate: 'https://token-cdn-domain/{id}.json',
      protocolFeeBeneficiary: platformFeeBeneficiary.address,
      protocolFeeRate_e18: toFp18(0.25),
      contractURI: 'https://metadata-url.com/my-metadata',
    };

    contract = (await deploySimpleOracle(deployer, baseParams)).connect(creator);
  });

  setupSnapshotHooks();

  const whitelistPaymentToken = async () => {
    expect(await contract.isPaymentTokenWhitelisted(paymentToken.address)).to.be.false;
    await (await contract.connect(deployer).updatePaymentTokenWhitelist(paymentToken.address, true)).wait();
    expect(await contract.isPaymentTokenWhitelisted(paymentToken.address)).to.be.true;
  };

  it('PaymentTokenNotWhitelisted', async () => {
    await expect(contract.createVirtualFloor(creationParams)).to.be.revertedWith('PaymentTokenNotWhitelisted()');
    await whitelistPaymentToken();
    await expect(contract.createVirtualFloor(creationParams)).to.emit(contract, 'VirtualFloorCreation');
  });

  describe('paymentToken whitelisted', () => {
    before(async () => {
      await whitelistPaymentToken();
    });

    it('virtualFloorId', async () => {
      await expect(contract.createVirtualFloor({ ...creationParams, vfId: BigNumber.from('0x010000000001') })).to.be.revertedWith('InvalidVirtualFloorId()');
    });

    describe('betaOpen', () => {
      it('betaOpen < 1', async () => {
        await expect(contract.createVirtualFloor({ ...creationParams, betaOpen_e18: toFp18(1).sub(1) })).to.be.revertedWith('BetaOpenTooSmall()');
        await expect(contract.createVirtualFloor({ ...creationParams, betaOpen_e18: toFp18(1).sub(0) })).to.emit(contract, 'VirtualFloorCreation');
      });
      it('UFixed32x6LossOfPrecision', async () => {
        await expect(contract.createVirtualFloor({ ...creationParams, betaOpen_e18: toFp18(1.2345678) })).to.be.revertedWith('UFixed32x6LossOfPrecision(234567800000000000)');
        const { events } = await (await contract.createVirtualFloor({ ...creationParams, betaOpen_e18: toFp18(1.234567) })).wait();
        const event = findContractEventArgs(events, 'VirtualFloorCreation');
        expect(event).to.be.not.undefined;
        const { betaOpen_e18 } = event;
        expect(betaOpen_e18).to.eq(1_234567_000000_000000n);
      });
    });

    describe('totalFeeRate', () => {
      it('totalFeeRate > 1', async () => {
        await expect(contract.createVirtualFloor({ ...creationParams, totalFeeRate_e18: toFp18(1).add(1) })).to.be.revertedWith('CreationFeeRateTooLarge()');
        await expect(contract.createVirtualFloor({ ...creationParams, totalFeeRate_e18: toFp18(1).add(0) })).to.emit(contract, 'VirtualFloorCreation');
      });
      it('UFixed16x4LossOfPrecision', async () => {
        await expect(contract.createVirtualFloor({ ...creationParams, totalFeeRate_e18: toFp18(0.23456) })).to.be.revertedWith('UFixed16x4LossOfPrecision(234560000000000000)');
        const { events } = await (await contract.createVirtualFloor({ ...creationParams, totalFeeRate_e18: toFp18(0.2345) })).wait();
        const event = findContractEventArgs(events, 'VirtualFloorCreation');
        expect(event).to.be.not.undefined;
        const { totalFeeRate_e18 } = event;
        expect(totalFeeRate_e18).to.eq(234500_000000_000000n);
      });
      describe('valid range', () => {
        for (const totalFeeRate of [0.0000, 0.0001, 0.5000, 0.9999, 1.0000]) {
          const totalFeeRate_e18 = toFp18(totalFeeRate);
          it(`totalFeeRate = ${totalFeeRate}`, async () => {
            await expect(contract.createVirtualFloor({ ...creationParams, totalFeeRate_e18 })).to.emit(contract, 'VirtualFloorCreation');
            expect((await contract.getVirtualFloorParams('0x010000000000')).totalFeeRate_e18).to.eq(totalFeeRate_e18);
          });
        }
      });
    });

    describe('InvalidTimeline', () => {
      it('tOpen < tClose', async () => {
        await expect(contract.createVirtualFloor({ ...creationParams, tClose: tOpen })).to.be.revertedWith('InvalidTimeline()');
        await expect(contract.createVirtualFloor({ ...creationParams, tClose: tOpen + 1 })).to.emit(contract, 'VirtualFloorCreation');
      });
      it('tResolve - tClose >= _MIN_POSSIBLE_T_RESOLVE_MINUS_T_CLOSE', async () => {
        await expect(contract.createVirtualFloor({ ...creationParams, tResolve: tClose + _MIN_POSSIBLE_T_RESOLVE_MINUS_T_CLOSE - 1 })).to.be.revertedWith('InvalidTimeline()');
        await expect(contract.createVirtualFloor({ ...creationParams, tResolve: tClose + _MIN_POSSIBLE_T_RESOLVE_MINUS_T_CLOSE })).to.emit(contract, 'VirtualFloorCreation');
      });
    });

    it('NotEnoughOutcomes', async () => {
      await expect(contract.createVirtualFloor({ ...creationParams, nOutcomes: 1 })).to.be.revertedWith('NotEnoughOutcomes()');
      // ToDo: If we were using actual DoubleDice, this would fail with InvalidOutcomesArrayLength
      await expect(contract.createVirtualFloor({ ...creationParams, nOutcomes: 2 })).to.emit(contract, 'VirtualFloorCreation');
    });

    describe('TooLate', () => {
      it('t > 10% between tOpen and tClose: fails', async () => {
        const { timestamp: t0 } = await ethers.provider.getBlock('latest');
        await ethers.provider.send('evm_setNextBlockTimestamp', [t0 + 11]);
        await expect(contract.createVirtualFloor({ ...creationParams, tOpen: t0 + 0, tClose: t0 + 100 })).to.be.revertedWith('TooLate()');
      });
      it('t = 10% between tOpen and tClose: succeeds', async () => {
        const { timestamp: t0 } = await ethers.provider.getBlock('latest');
        await ethers.provider.send('evm_setNextBlockTimestamp', [t0 + 10]);
        await expect(contract.createVirtualFloor({ ...creationParams, tOpen: t0 + 0, tClose: t0 + 100 })).to.emit(contract, 'VirtualFloorCreation');
      });
    });

    it('DuplicateVirtualFloorId', async () => {
      await expect(contract.createVirtualFloor(creationParams)).to.emit(contract, 'VirtualFloorCreation');
      await expect(contract.createVirtualFloor(creationParams)).to.be.revertedWith('DuplicateVirtualFloorId()');
    });

    describe('bonusAmount', () => {
      it('bonusAmount = 0', async () => {
        const { events, logs } = await (await contract.createVirtualFloor({ ...creationParams, bonusAmount: 0 })).wait();
        const event = findContractEventArgs(events, 'VirtualFloorCreation');
        expect(event.bonusAmount).to.eq(0);
        const { bonusAmount } = await contract.getVirtualFloorParams(vfId);
        expect(bonusAmount).to.eq(0);
        expect(decodeEventLogs(contract, logs)).to.containSubset([{ event: 'VirtualFloorCreation' }]);
        expect(decodeEventLogs(paymentToken, logs)).to.not.containSubset([{ event: 'Transfer' }]);
      });
      it('bonusAmount > 0', async () => {
        const bonusAmount = 10_000000n;

        await (await paymentToken.connect(deployer).mint(creator.address, bonusAmount)).wait();

        await expect(contract.createVirtualFloor({ ...creationParams, bonusAmount })).to.be.revertedWith('ERC20: insufficient allowance');

        await (await paymentToken.connect(creator).approve(contract.address, ethers.constants.MaxUint256)).wait();

        const { events, logs } = await (await contract.createVirtualFloor({ ...creationParams, bonusAmount })).wait();
        const event = findContractEventArgs(events, 'VirtualFloorCreation');
        expect(event.bonusAmount).to.eq(10_000000n);
        const { bonusAmount: setBonusAmount } = await contract.getVirtualFloorParams(vfId);
        expect(setBonusAmount).to.eq(10_000000n);
        expect(decodeEventLogs(contract, logs)).to.containSubset([{ event: 'VirtualFloorCreation' }]);

        expect(decodeEventLogs(paymentToken, logs)).to.containSubset([{ event: 'Transfer' }]);

        const transferEvent = decodeEventLogs(paymentToken, logs).find(({ event }) => event === 'Transfer');
        assert(transferEvent);
        expect(transferEvent.args.value).to.eq(10_000000n);
      });
    });

    describe('min/max commitment amounts', () => {
      const DEFAULT_MIN = 1;
      const DEFAULT_MAX = ethers.constants.MaxUint256;
      it('min=default,max=default', async () => {
        await expect(contract.createVirtualFloor({
          ...creationParams,
          optionalMinCommitmentAmount: 0,
          optionalMaxCommitmentAmount: 0,
        })).to.emit(contract, 'VirtualFloorCreation');
        const { minCommitmentAmount, maxCommitmentAmount } = await contract.getVirtualFloorParams(vfId);
        expect(minCommitmentAmount).to.eq(DEFAULT_MIN);
        expect(maxCommitmentAmount).to.eq(DEFAULT_MAX);
      });
      it('min=default,max=100', async () => {
        await expect(contract.createVirtualFloor({
          ...creationParams,
          optionalMinCommitmentAmount: 0,
          optionalMaxCommitmentAmount: 100_000000n,
        })).to.emit(contract, 'VirtualFloorCreation');
        const { minCommitmentAmount, maxCommitmentAmount } = await contract.getVirtualFloorParams(vfId);
        expect(minCommitmentAmount).to.eq(DEFAULT_MIN);
        expect(maxCommitmentAmount).to.eq(100_000000n);
      });
      it('min=100,max=default', async () => {
        await expect(contract.createVirtualFloor({
          ...creationParams,
          optionalMinCommitmentAmount: 100_000000n,
          optionalMaxCommitmentAmount: 0,
        })).to.emit(contract, 'VirtualFloorCreation');
        const { minCommitmentAmount, maxCommitmentAmount } = await contract.getVirtualFloorParams(vfId);
        expect(minCommitmentAmount).to.eq(100_000000n);
        expect(maxCommitmentAmount).to.eq(DEFAULT_MAX);
      });
      it('min=100,max=1000', async () => {
        await expect(contract.createVirtualFloor({
          ...creationParams,
          optionalMinCommitmentAmount: 100_000000n,
          optionalMaxCommitmentAmount: 1000_000000n,
        })).to.emit(contract, 'VirtualFloorCreation');
        const { minCommitmentAmount, maxCommitmentAmount } = await contract.getVirtualFloorParams(vfId);
        expect(minCommitmentAmount).to.eq(100_000000n);
        expect(maxCommitmentAmount).to.eq(1000_000000n);
      });
      it('min=1000,max=100: fails', async () => {
        await expect(contract.createVirtualFloor({
          ...creationParams,
          optionalMinCommitmentAmount: 1000_000000n,
          optionalMaxCommitmentAmount: 100_000000n,
        })).to.be.revertedWith('InvalidMinMaxCommitmentAmounts()');
      });
    });
  });

});
