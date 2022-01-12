import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import chai, { expect } from 'chai';
import chaiSubset from 'chai-subset';
import { BigNumber, BigNumberish, Event as ContractEvent } from 'ethers';
import { ethers } from 'hardhat';
import { formatUsdc, sumOf } from '../lib';
import { DoubleDice, DoubleDice__factory, DummyUSDCoin, DummyUSDCoin__factory } from '../typechain-types';

chai.use(chaiSubset);

const toTimestamp = (datetime: string): BigNumber => BigNumber.from(new Date(datetime).getTime() / 1000);

const setNextBlockTimestamp = async (datetime: string) => {
  await ethers.provider.send('evm_setNextBlockTimestamp', [toTimestamp(datetime).toNumber()]);
};

function tokenIdOf({ virtualFloorId, outcomeIndex, datetime }: { virtualFloorId: string; outcomeIndex: number; datetime: string }): BigNumber {
  return BigNumber.from(ethers.utils.solidityKeccak256(['bytes32', 'uint8', 'uint256'], [virtualFloorId, outcomeIndex, toTimestamp(datetime)]));
}

describe('DoubleDice', function () {

  let ownerSigner: SignerWithAddress;
  let feeBeneficiarySigner: SignerWithAddress;
  let user1Signer: SignerWithAddress;
  let user2Signer: SignerWithAddress;
  let user3Signer: SignerWithAddress;
  let user4Signer: SignerWithAddress;
  let contract: DoubleDice;
  let token: DummyUSDCoin;

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
    contract = await new DoubleDice__factory(ownerSigner).deploy(
      'http://localhost:8080/token/{id}',
      feeBeneficiarySigner.address
    );
    await contract.deployed();

    expect(await contract.feeBeneficiary()).to.eq(feeBeneficiarySigner.address);

    const $ = (dollars: BigNumberish, millionths: BigNumberish = 0): BigNumber => BigNumber.from(1000000).mul(dollars).add(millionths);

    // Mint 1000$ to each user    
    await (await token.connect(ownerSigner).mint(user1Signer.address, $(1000))).wait();
    await (await token.connect(ownerSigner).mint(user2Signer.address, $(1000))).wait();
    await (await token.connect(ownerSigner).mint(user3Signer.address, $(1000))).wait();

    // Allow the contract to transfer up to 100$ from each user
    await (await token.connect(user1Signer).approve(contract.address, $(100))).wait();
    await (await token.connect(user2Signer).approve(contract.address, $(100))).wait();
    await (await token.connect(user3Signer).approve(contract.address, $(100))).wait();

    const virtualFloorId = '0x0000000000000000000000000000000000000000000000000000000000012345';
    const betaGradient = BigNumber.from(10).pow(18).div(3600); // 1 unit per hour
    const tClose = toTimestamp('2032-01-01T12:00:00');
    const tResolve = toTimestamp('2032-01-02T00:00:00');
    const nOutcomes = 3;

    interface UserCommitment {
      virtualFloorId: string;
      outcomeIndex: number;
      timeslot: BigNumber;
      amount: BigNumber;
      tokenId: BigNumber;
    }
    const allUserCommitments: UserCommitment[] = [];

    const findUserCommitmentEvent = (events: ContractEvent[]): UserCommitment => {
      const event = events.find(({ event }) => event === 'UserCommitment');
      return event.args as unknown as UserCommitment;
    };


    {
      await setNextBlockTimestamp('2032-01-01T00:00:00');

      const {
        events: [virtualFloorCreatedEvent],
        blockHash
      } = await (await contract.createVirtualFloor(virtualFloorId, betaGradient, tClose, tResolve, nOutcomes, token.address)).wait();
      const { timestamp } = await ethers.provider.getBlock(blockHash);
      expect(timestamp).to.eq(toTimestamp('2032-01-01T00:00:00'));

      expect(virtualFloorCreatedEvent).to.containSubset({
        event: 'VirtualFloorCreation',
        args: {
          virtualFloorId
        }
      });
    }

    {
      const outcomeIndex = 0;
      const amount = $(10);


      await setNextBlockTimestamp('2032-01-01T01:00:00');

      const { events, blockHash } = await (await contract.connect(user1Signer).commitToVirtualFloor(virtualFloorId, outcomeIndex, amount)).wait();

      const virtualFloorCommitmentArgs = findUserCommitmentEvent(events);
      allUserCommitments.push(virtualFloorCommitmentArgs);

      const token1155Transfer = events.find(({ event }) => event === 'TransferSingle');

      expect(token1155Transfer.args.from).to.eq('0x0000000000000000000000000000000000000000');
      expect(token1155Transfer.args.to).to.eq(user1Signer.address);
      expect(token1155Transfer.args.value).to.eq(amount);

      const nftId = token1155Transfer.args.id;
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
      const userCommitmentArgs = findUserCommitmentEvent(events);
      expect(userCommitmentArgs.timeslot).to.eq(toTimestamp('2032-01-01T02:00:00'));
      allUserCommitments.push(userCommitmentArgs);
    }
    {
      const { events } = await (await contract.connect(user3Signer).commitToVirtualFloor(virtualFloorId, 1, $(10))).wait();
      const userCommitmentArgs = findUserCommitmentEvent(events);
      expect(userCommitmentArgs.timeslot).to.eq(toTimestamp('2032-01-01T02:00:00'));
      allUserCommitments.push(userCommitmentArgs);
    }

    await setNextBlockTimestamp('2032-01-01T06:00:00');
    {
      const { events } = await (await contract.connect(user3Signer).commitToVirtualFloor(virtualFloorId, 1, $(10))).wait();
      const userCommitmentArgs = findUserCommitmentEvent(events);
      expect(userCommitmentArgs.timeslot).to.eq(toTimestamp('2032-01-01T06:00:00'));
      allUserCommitments.push(userCommitmentArgs);
    }
    {
      const { events } = await (await contract.connect(user3Signer).commitToVirtualFloor(virtualFloorId, 2, $(10))).wait();
      const userCommitmentArgs = findUserCommitmentEvent(events);
      expect(userCommitmentArgs.timeslot).to.eq(toTimestamp('2032-01-01T06:00:00'));
      allUserCommitments.push(userCommitmentArgs);
    }

    await setNextBlockTimestamp('2032-01-01T10:00:00');
    {
      const { events } = await (await contract.connect(user3Signer).commitToVirtualFloor(virtualFloorId, 2, $(10))).wait();
      const userCommitmentArgs = findUserCommitmentEvent(events);
      expect(userCommitmentArgs.timeslot).to.eq(toTimestamp('2032-01-01T10:00:00'));
      allUserCommitments.push(userCommitmentArgs);
    }

    // await setNextBlockTimestamp('2032-01-01T12:00:00')
    // expect(contract.connect(user3Signer).commitToVirtualFloor(virtualFloorId, 2, $(10))).to.be.revertedWith('MARKET_CLOSED')

    // const virtualFloor = await contract._virtualFloors(virtualFloorId)
    // console.log(virtualFloor)

    interface AggregateCommitment {
      amount: BigNumber;
      weightedAmount: BigNumber;
    }

    const aggregateCommitments: AggregateCommitment[] = await Promise.all([
      contract.getVirtualFloorAggregateCommitments(virtualFloorId, 0),
      contract.getVirtualFloorAggregateCommitments(virtualFloorId, 1),
      contract.getVirtualFloorAggregateCommitments(virtualFloorId, 2),
    ]);

    const betaAt = (datetime: string) => tClose.sub(toTimestamp(datetime)).mul(betaGradient).add(BigNumber.from(10).pow(18));

    expect(aggregateCommitments[0].amount).to.eq(sumOf(
      $(10)
    ));
    expect(aggregateCommitments[0].weightedAmount).to.eq(sumOf(
      $(10).mul(betaAt('2032-01-01T01:00:00'))
    ));

    expect(aggregateCommitments[1].amount).to.eq(sumOf(
      $(10),
      $(10),
      $(10),
    ));
    expect(aggregateCommitments[1].weightedAmount).to.eq(sumOf(
      $(10).mul(betaAt('2032-01-01T02:00:00')),
      $(10).mul(betaAt('2032-01-01T02:00:00')),
      $(10).mul(betaAt('2032-01-01T06:00:00')),
    ));

    expect(aggregateCommitments[2].amount).to.eq(sumOf(
      $(10),
      $(10),
    ));
    expect(aggregateCommitments[2].weightedAmount).to.eq(sumOf(
      $(10).mul(betaAt('2032-01-01T06:00:00')),
      $(10).mul(betaAt('2032-01-01T10:00:00')),
    ));

    // await setNextBlockTimestamp('2032-01-01T23:59:59')
    // expect(contract.resolve(virtualFloorId, 1)).to.be.revertedWith('TOO_EARLY_TO_RESOLVE')

    await setNextBlockTimestamp('2032-01-02T00:00:00');
    {
      const { events } = await (await contract.resolve(virtualFloorId, 1)).wait();
      const {
        args: {
          winnerProfits,
          feeAmount
        }
      } = events.find(({ event }) => event === 'VirtualFloorResolution');


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
});
