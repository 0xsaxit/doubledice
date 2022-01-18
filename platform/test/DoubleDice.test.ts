import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import chai, { expect } from 'chai';
import chaiSubset from 'chai-subset';
import {
  BigNumber,
  BigNumberish
} from 'ethers';
import { ethers } from 'hardhat';
import {
  DoubleDice,
  DoubleDice__factory,
  DummyERC20,
  DummyUSDCoin__factory
} from '../lib/contracts';
import {
  DUMMY_METADATA_HASH,
  EvmCheckpoint,
  findContractEventArgs,
  findUserCommitmentEventArgs,
  formatUsdc,
  sumOf,
  UserCommitment
} from './helpers';

chai.use(chaiSubset);

const toTimestamp = (datetime: string): BigNumber => BigNumber.from(new Date(datetime).getTime() / 1000);

const setNextBlockTimestamp = async (datetime: string) => {
  await ethers.provider.send('evm_setNextBlockTimestamp', [toTimestamp(datetime).toNumber()]);
};

function tokenIdOf({ virtualFloorId, outcomeIndex, datetime }: { virtualFloorId: BigNumberish; outcomeIndex: number; datetime: string }): BigNumber {
  const bytes = ethers.utils.arrayify(ethers.utils.solidityKeccak256(['uint256', 'uint8', 'uint256'], [virtualFloorId, outcomeIndex, toTimestamp(datetime)]));
  bytes[0] = 0x01; // commitment tokenIds must start 0x01...
  return BigNumber.from(bytes);
}

describe('DoubleDice', function () {

  let ownerSigner: SignerWithAddress;
  let paymentTokenWhitelister: SignerWithAddress;
  let feeBeneficiarySigner: SignerWithAddress;
  let user1Signer: SignerWithAddress;
  let user2Signer: SignerWithAddress;
  let user3Signer: SignerWithAddress;
  let user4Signer: SignerWithAddress;
  let contract: DoubleDice;
  let token: DummyERC20;

  let checkpoint;

  before(async () => {
    checkpoint = await EvmCheckpoint.create();
  });

  it('should go through the entire VPF cycle successfully', async function () {
    [
      ownerSigner,
      paymentTokenWhitelister,
      feeBeneficiarySigner,
      user1Signer,
      user2Signer,
      user3Signer
    ] = await ethers.getSigners();
    token = await new DummyUSDCoin__factory(ownerSigner).deploy();
    await token.deployed();
    contract = await new DoubleDice__factory(ownerSigner).deploy(
      'http://localhost:8080/token/{id}',
      feeBeneficiarySigner.address
    );
    await contract.deployed();

    expect(await contract.feeBeneficiary()).to.eq(feeBeneficiarySigner.address);

    {
      await expect(contract.connect(ownerSigner).updatePaymentTokenWhitelist(token.address, true)).to.be.reverted;
      await expect(contract.connect(paymentTokenWhitelister).updatePaymentTokenWhitelist(token.address, true)).to.be.reverted;
      const PAYMENT_TOKEN_WHITELISTER_ROLE = await contract.PAYMENT_TOKEN_WHITELISTER_ROLE();
      expect(await contract.hasRole(PAYMENT_TOKEN_WHITELISTER_ROLE, paymentTokenWhitelister.address)).to.be.false;
      await (await contract.connect(ownerSigner).grantRole(PAYMENT_TOKEN_WHITELISTER_ROLE, paymentTokenWhitelister.address)).wait();
      expect(await contract.hasRole(PAYMENT_TOKEN_WHITELISTER_ROLE, paymentTokenWhitelister.address)).to.be.true;
      expect(await contract.isPaymentTokenWhitelisted(token.address)).to.be.false;
      const { events } = await (await contract.connect(paymentTokenWhitelister).updatePaymentTokenWhitelist(token.address, true)).wait();
      expect(events).to.have.lengthOf(1);
      expect(findContractEventArgs(events, 'PaymentTokenWhitelistUpdate')).to.containSubset({
        token: token.address,
        enabled: true
      });
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

    const virtualFloorId = 12345;
    const betaOpen = BigNumber.from(10).pow(18).mul(13); // 1 unit per hour
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
        tOpen,
        tClose,
        tResolve,
        nOutcomes,
        paymentToken: token.address,
        metadataHash: DUMMY_METADATA_HASH
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

    await setNextBlockTimestamp('2032-01-02T00:00:00');
    {
      const { events } = await (await contract.resolve(virtualFloorId, 1)).wait();
      const { winnerProfits, feeAmount } = findContractEventArgs(events, 'VirtualFloorResolution');

      const tcf = sumOf(...aggregateCommitments.map(({ amount }) => amount));

      let i = 0;
      for (const { amount } of aggregateCommitments) {
        console.log(`amount[${i++}] = ${formatUsdc(amount)}`);
      }

      console.log(`tcf            = ${formatUsdc(tcf)}`);
      console.log(`winnerProfits  = ${formatUsdc(winnerProfits)}`);
      console.log(`feeAmount      = ${formatUsdc(feeAmount)}`);

      // console.log(allUserCommitments)


      // user3 gives user2 5$ worth of commitment made at 2032-01-01T02:00:00
      await (await contract.connect(user3Signer).safeTransferFrom(
        user3Signer.address,
        user2Signer.address,
        tokenIdOf({ virtualFloorId, outcomeIndex: 1, datetime: '2032-01-01T02:00:00' }),
        $(5),
        '0x'
      )).wait();

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
  })

});
