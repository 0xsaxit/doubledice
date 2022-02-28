import {
  BigNumber,
  BigNumberish
} from 'ethers';
import {
  findUserCommitmentEventArgs,
  findVFResolutionEventArgs,
  SignerWithAddress,
  UserCommitment,
  VirtualFloorResolution
} from '.';
import {
  DoubleDice,
  DummyUSDCoin,
  DummyWrappedBTC
} from '../lib/contracts';

type AddressOrSigner = string | SignerWithAddress;

export const toAddress = (addressOrSigner: AddressOrSigner) => typeof addressOrSigner === 'string' ? addressOrSigner : addressOrSigner.address;

export class DoubleDicePlatformHelper {
  constructor(private contract: DoubleDice) { }

  balanceOf(addressOrSigner: string, tokenId: string): Promise<BigNumber> {
    return this.contract.balanceOf(addressOrSigner, tokenId);
  }

  async mintTokensForUser({
    token,
    ownerSigner,
    userAddress,
    amount,
  }: {
    token: DummyUSDCoin | DummyWrappedBTC;
    ownerSigner: SignerWithAddress;
    userAddress: string;
    amount: BigNumber;
  }) {
    return await (
      await token.connect(ownerSigner).mint(userAddress, amount)
    ).wait();
  }
  async mintTokenAndGiveAllowanceToContract({
    token,
    ownerSigner,
    usersSigner,
    mintAmount,
    allowanceAmount,
    contractAddress,
  }: {
    token: DummyUSDCoin | DummyWrappedBTC;
    ownerSigner: SignerWithAddress;
    usersSigner: SignerWithAddress[];
    mintAmount: BigNumber;
    allowanceAmount: BigNumber;
    contractAddress: string;
  }) {
    for (const userSigner of usersSigner) {
      await (
        await token.connect(userSigner).approve(contractAddress, allowanceAmount)
      ).wait();

      await (
        await token.connect(ownerSigner).mint(toAddress(userSigner), mintAmount)
      ).wait();
    }
  }

  // async createVirtualFloor(
  //   virtualFloorCreationParams: VirtualFloorCreationParamsStruct
  // ) {
  //   return await (
  //     await this.contract.createVirtualFloor(virtualFloorCreationParams)
  //   ).wait();
  // }

  async commitToVirtualFloor(
    virtualFloorId: BigNumberish,
    outcomeIndex: number,
    userSigner: SignerWithAddress,
    amount: BigNumberish
  ): Promise<UserCommitment> {
    const { events } = await (
      await this.contract
        .connect(userSigner)
        .commitToVirtualFloor(virtualFloorId, outcomeIndex, amount)
    ).wait();

    return (findUserCommitmentEventArgs(
      events
    ) as unknown) as UserCommitment;
  }

  async resolveVirtualFloor(
    virtualFloorId: BigNumberish,
    outcomeIndex: number,
    ownerSigner: SignerWithAddress
  ): Promise<VirtualFloorResolution> {
    const { events } = await (
      await this.contract
        .connect(ownerSigner)
        .resolve(virtualFloorId, outcomeIndex)
    ).wait();

    return (findVFResolutionEventArgs(
      events
    ) as unknown) as VirtualFloorResolution;
  }


  async claim(
    virtualFloorId: BigNumberish,
    outcomeIndex: number,
    userSigner: SignerWithAddress,
    timeslot: BigNumber
  ) {
    return await (
      await this.contract
        .connect(userSigner)
        .claim({ virtualFloorId, outcomeIndex, timeslot })
    ).wait();
  }
}
