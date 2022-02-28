import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import chai, { expect } from 'chai';
import chaiSubset from 'chai-subset';
import {
  BigNumber,
  BigNumberish
} from 'ethers';
import { ethers } from 'hardhat';
import {
  deployAndInitialize,
  DUMMY_METADATA,
  EvmCheckpoint,
  findContractEventArgs,
  findUserCommitmentEventArgs,
  formatUsdc,
  sumOf,
  UserCommitment
} from '../helpers';
import {
  DoubleDice,
  DummyUSDCoin,
  DummyUSDCoin__factory,
  DummyWrappedBTC
} from '../lib/contracts';

chai.use(chaiSubset);

const toTimestamp = (datetime: string): BigNumber => BigNumber.from(new Date(datetime).getTime() / 1000);

const setNextBlockTimestamp = async (datetime: string | number | BigNumber) => {
  let timestamp: BigNumber;
  if (typeof datetime === 'string') {
    timestamp = toTimestamp(datetime);
  } else {
    timestamp = BigNumber.from(datetime);
  }
  await ethers.provider.send('evm_setNextBlockTimestamp', [timestamp.toNumber()]);
};

function tokenIdOf({ virtualFloorId, outcomeIndex, datetime }: { virtualFloorId: BigNumberish; outcomeIndex: number; datetime: string }): BigNumber {
  const timeslot = toTimestamp(datetime);
  return BigNumber.from(ethers.utils.solidityPack(
    ['uint216', 'uint8', 'uint32'],
    [BigNumber.from(virtualFloorId).shr((1 + 4) * 8), outcomeIndex, timeslot]
  ));
}

describe('DoubleDice', function () {

  let ownerSigner: SignerWithAddress;
  let feeBeneficiarySigner: SignerWithAddress;
  let user1Signer: SignerWithAddress;
  let user2Signer: SignerWithAddress;
  let user3Signer: SignerWithAddress;
  let contract: DoubleDice;
  let token: DummyUSDCoin | DummyWrappedBTC;
  let checkpoint: EvmCheckpoint;

  before(async () => {
    checkpoint = await EvmCheckpoint.create(ethers.provider);
  });

  it('should go through the entire VPF cycle successfully', async function () {
    [
      ownerSigner,
      feeBeneficiarySigner,
      user1Signer,
      user2Signer,
      user3Signer
    ] = await ethers.getSigners();

    token = await new DummyUSDCoin__factory(ownerSigner).deploy();
    await token.deployed();

    contract = await deployAndInitialize(ownerSigner, { FEE_BENEFICIARY_ADDRESS: feeBeneficiarySigner.address });

    expect(await contract.platformFeeBeneficiary()).to.eq(feeBeneficiarySigner.address);

    {
      expect(await contract.isPaymentTokenWhitelisted(token.address)).to.be.false;
      const { events } = await (await contract.connect(ownerSigner).updatePaymentTokenWhitelist(token.address, true)).wait();
      expect(events).to.have.lengthOf(1);
      expect(findContractEventArgs(events, 'PaymentTokenWhitelistUpdate')).to.containSubset({
        token: token.address,
        whitelisted: true
      });
      expect(await contract.isPaymentTokenWhitelisted(token.address)).to.be.true;
    }

    const $ = (dollars: BigNumberish, millionths: BigNumberish = 0): BigNumber => BigNumber.from(1000000).mul(dollars).add(millionths);

    // Mint 1000$ to each user    
    await (await token.connect(ownerSigner).mint(user1Signer.address, $(1000))).wait();
    await (await token.connect(ownerSigner).mint(user2Signer.address, $(1000))).wait();
    await (await token.connect(ownerSigner).mint(user3Signer.address, $(1000))).wait();

    // Allow the contract to transfer up to 100$ from each user
    await (await token.connect(user1Signer).approve(contract.address, $(100))).wait();
    await (await token.connect(user2Signer).approve(contract.address, $(100))).wait();
    await (await token.connect(user3Signer).approve(contract.address, $(100))).wait();

    const virtualFloorId = 0x123450000000000n; // lower 5 bytes must be all 00
    const betaOpen = BigNumber.from(10).pow(18).mul(13); // 1 unit per hour
    const creationFeeRate = BigNumber.from(10).pow(18).mul(15).div(1000); // 1.5%
    const tOpen = toTimestamp('2032-01-01T00:00:00');
    const tClose = toTimestamp('2032-01-01T12:00:00');
    const tResolve = toTimestamp('2032-01-02T00:00:00');
    const nOutcomes = 3;

    const allUserCommitments: UserCommitment[] = [];

    {
      await setNextBlockTimestamp('2032-01-01T00:00:00');

      const {
        events,
        blockHash
      } = await (await contract.createVirtualFloor({
        virtualFloorId,
        betaOpen_e18: betaOpen,
        creationFeeRate_e18: creationFeeRate,
        tOpen,
        tClose,
        tResolve,
        nOutcomes,
        paymentToken: token.address,
        metadata: DUMMY_METADATA
      })).wait();
      const { timestamp } = await ethers.provider.getBlock(blockHash);
      expect(timestamp).to.eq(toTimestamp('2032-01-01T00:00:00'));

      const virtualFloorCreatedEventArgs = findContractEventArgs(events, 'VirtualFloorCreation');
      expect(virtualFloorCreatedEventArgs.virtualFloorId).to.eq(virtualFloorId);
    }

    {
      const outcomeIndex = 0;
      const amount = $(10);

      await setNextBlockTimestamp('2032-01-01T01:00:00');

      const { events, blockHash } = await (await contract.connect(user1Signer).commitToVirtualFloor(virtualFloorId, outcomeIndex, amount)).wait();

      const virtualFloorCommitmentArgs = findUserCommitmentEventArgs(events);
      allUserCommitments.push(virtualFloorCommitmentArgs);

      const token1155TransferArgs = findContractEventArgs(events, 'TransferSingle');

      expect(token1155TransferArgs.from).to.eq('0x0000000000000000000000000000000000000000');
      expect(token1155TransferArgs.to).to.eq(user1Signer.address);
      expect(token1155TransferArgs.value).to.eq(amount);

      const nftId = token1155TransferArgs.id;
      // console.log(`nftId = ${nftId}`)

      expect(virtualFloorCommitmentArgs.virtualFloorId).to.eq(virtualFloorId);
      expect(virtualFloorCommitmentArgs.outcomeIndex).to.eq(outcomeIndex);
      expect(virtualFloorCommitmentArgs.amount).to.eq(amount);
      expect(virtualFloorCommitmentArgs.tokenId).to.eq(nftId);
      expect(virtualFloorCommitmentArgs.timeslot).to.eq(toTimestamp('2032-01-01T01:00:00'));

      expect((await ethers.provider.getBlock(blockHash)).timestamp).to.eq(toTimestamp('2032-01-01T01:00:00'));

    }


    await setNextBlockTimestamp('2032-01-01T02:00:00');
    {
      const { events } = await (await contract.connect(user2Signer).commitToVirtualFloor(virtualFloorId, 1, $(10))).wait();
      const userCommitmentArgs = findUserCommitmentEventArgs(events);
      expect(userCommitmentArgs.timeslot).to.eq(toTimestamp('2032-01-01T02:00:00'));
      allUserCommitments.push(userCommitmentArgs);
    }
    {
      const { events } = await (await contract.connect(user3Signer).commitToVirtualFloor(virtualFloorId, 1, $(10))).wait();
      const userCommitmentArgs = findUserCommitmentEventArgs(events);
      expect(userCommitmentArgs.timeslot).to.eq(toTimestamp('2032-01-01T02:00:00'));
      allUserCommitments.push(userCommitmentArgs);
    }

    await setNextBlockTimestamp('2032-01-01T06:00:00');
    {
      const { events } = await (await contract.connect(user3Signer).commitToVirtualFloor(virtualFloorId, 1, $(10))).wait();
      const userCommitmentArgs = findUserCommitmentEventArgs(events);
      expect(userCommitmentArgs.timeslot).to.eq(toTimestamp('2032-01-01T06:00:00'));
      allUserCommitments.push(userCommitmentArgs);
    }
    {
      const { events } = await (await contract.connect(user3Signer).commitToVirtualFloor(virtualFloorId, 2, $(10))).wait();
      const userCommitmentArgs = findUserCommitmentEventArgs(events);
      expect(userCommitmentArgs.timeslot).to.eq(toTimestamp('2032-01-01T06:00:00'));
      allUserCommitments.push(userCommitmentArgs);
    }

    await setNextBlockTimestamp('2032-01-01T10:00:00');
    {
      const { events } = await (await contract.connect(user3Signer).commitToVirtualFloor(virtualFloorId, 2, $(10))).wait();
      const userCommitmentArgs = findUserCommitmentEventArgs(events);
      expect(userCommitmentArgs.timeslot).to.eq(toTimestamp('2032-01-01T10:00:00'));
      allUserCommitments.push(userCommitmentArgs);
    }

    // await setNextBlockTimestamp('2032-01-01T12:00:00')
    // expect(contract.connect(user3Signer).commitToVirtualFloor(virtualFloorId, 2, $(10))).to.be.revertedWith('MARKET_CLOSED')

    // const virtualFloor = await contract._virtualFloors(virtualFloorId)
    // console.log(virtualFloor)

    interface AggregateCommitment {
      amount: BigNumber;
      amountTimesBeta_e18: BigNumber;
    }

    const aggregateCommitments: AggregateCommitment[] = await Promise.all([
      contract.getVirtualFloorAggregateCommitments(virtualFloorId, 0),
      contract.getVirtualFloorAggregateCommitments(virtualFloorId, 1),
      contract.getVirtualFloorAggregateCommitments(virtualFloorId, 2),
    ]);

    const betaAt = (datetime: string) => {
      const betaClose = BigNumber.from(10).pow(18);
      const dB = betaOpen.sub(betaClose);
      const dT = tClose.sub(tOpen);
      const dt = tClose.sub(toTimestamp(datetime));
      const db = dB.mul(dt).div(dT);
      return betaClose.add(db);
    };

    expect(aggregateCommitments[0].amount).to.eq(sumOf(
      $(10)
    ));
    expect(aggregateCommitments[0].amountTimesBeta_e18).to.eq(sumOf(
      $(10).mul(betaAt('2032-01-01T01:00:00'))
    ));

    expect(aggregateCommitments[1].amount).to.eq(sumOf(
      $(10),
      $(10),
      $(10),
    ));
    expect(aggregateCommitments[1].amountTimesBeta_e18).to.eq(sumOf(
      $(10).mul(betaAt('2032-01-01T02:00:00')),
      $(10).mul(betaAt('2032-01-01T02:00:00')),
      $(10).mul(betaAt('2032-01-01T06:00:00')),
    ));

    expect(aggregateCommitments[2].amount).to.eq(sumOf(
      $(10),
      $(10),
    ));
    expect(aggregateCommitments[2].amountTimesBeta_e18).to.eq(sumOf(
      $(10).mul(betaAt('2032-01-01T06:00:00')),
      $(10).mul(betaAt('2032-01-01T10:00:00')),
    ));

    // await setNextBlockTimestamp('2032-01-01T23:59:59')
    // expect(contract.resolve(virtualFloorId, 1)).to.be.revertedWith('TOO_EARLY_TO_RESOLVE')

    await setNextBlockTimestamp(tClose);

    // user3 gives user2 5$ worth of commitment made at 2032-01-01T02:00:00
    await (await contract.connect(user3Signer).safeTransferFrom(
      user3Signer.address,
      user2Signer.address,
      tokenIdOf({ virtualFloorId, outcomeIndex: 1, datetime: '2032-01-01T02:00:00' }),
      $(5),
      '0x'
    )).wait();

    await setNextBlockTimestamp('2032-01-02T00:00:00');
    {
      const { events } = await (await contract.resolve(virtualFloorId, 1)).wait();
      const { winnerProfits, platformFeeAmount, ownerFeeAmount } = findContractEventArgs(events, 'VirtualFloorResolution');

      const tcf = sumOf(...aggregateCommitments.map(({ amount }) => amount));

      let i = 0;
      for (const { amount } of aggregateCommitments) {
        console.log(`amount[${i++}] = ${formatUsdc(amount)}`);
      }

      console.log(`tcf               = ${formatUsdc(tcf)}`);
      console.log(`winnerProfits     = ${formatUsdc(winnerProfits)}`);
      console.log(`platformFeeAmount = ${formatUsdc(platformFeeAmount)}`);
      console.log(`ownerFeeAmount    = ${formatUsdc(ownerFeeAmount)}`);

      // console.log(allUserCommitments)

      // contract.connect(user3Signer).safeBatchTransferFrom(
      //   user3Signer.address,
      //   user4Signer.address,
      //   [
      //     tokenIdOf({ virtualFloorId, outcomeIndex: 1, datetime: '2032-01-01T02:00:00' }),
      //     tokenIdOf({ virtualFloorId, outcomeIndex: 1, datetime: '2032-01-01T02:00:00' }),
      //   ], // ids
      //   [], // amounts
      //   '0x'
      // )

      console.log(`contract balance = ${formatUsdc(await token.balanceOf(contract.address))}`);

      const tx1 = await (await contract.connect(user2Signer).claim({
        virtualFloorId,
        outcomeIndex: 1,
        timeslot: toTimestamp('2032-01-01T02:00:00')
      })).wait();

      console.log(`contract balance = ${formatUsdc(await token.balanceOf(contract.address))}`);

      const tx2 = await (await contract.connect(user3Signer).claim({
        virtualFloorId,
        outcomeIndex: 1,
        timeslot: toTimestamp('2032-01-01T02:00:00')
      })).wait();

      console.log(`contract balance = ${formatUsdc(await token.balanceOf(contract.address))}`);

      const tx3 = await (await contract.connect(user3Signer).claim({
        virtualFloorId,
        outcomeIndex: 1,
        timeslot: toTimestamp('2032-01-01T06:00:00')
      })).wait();

      console.log(`contract balance = ${formatUsdc(await token.balanceOf(contract.address))}`);

      // const asdf = sumOf(...aggregateCommitments.map(({ weightedAmount }) => weightedAmount))
    }

  });

  after(async () => {
    await checkpoint.revertTo();
  });

});
