import { SignerWithAddress } from '.';
import { DoubleDice, DoubleDice__factory, DummyUSDCoin__factory, DummyWrappedBTC__factory } from '../lib/contracts';

export interface DeploymentParams {
  FEE_BENEFICIARY_ADDRESS: string;
}

export interface DeploymentOptions {
  forceNonce: boolean;
}

export async function deployAndInitialize(
  ownerSigner: SignerWithAddress,
  { FEE_BENEFICIARY_ADDRESS }: DeploymentParams,
  deploymentOptions?: DeploymentOptions
): Promise<DoubleDice> {
  const { forceNonce = false } = deploymentOptions || {};

  const tokenContract1 = await new DummyUSDCoin__factory(ownerSigner).deploy(forceNonce ? { nonce: 0 } : {});
  process.stdout.write(`Deploying USDC contract to: ${tokenContract1.address}...\n`);
  await tokenContract1.deployed();

  const mainContract = await new DoubleDice__factory(ownerSigner).deploy(
    'http://localhost:8080/token/{id}',
    FEE_BENEFICIARY_ADDRESS
  );
  process.stdout.write(`Deploying main  contract to: ${mainContract.address}...\n`);
  await mainContract.deployed();

  const tokenContract2 = await new DummyWrappedBTC__factory(ownerSigner).deploy();
  process.stdout.write(`Deploying WBTC contract to: ${tokenContract2.address}...\n`);
  await tokenContract2.deployed();

  await (await mainContract.connect(ownerSigner).updatePaymentTokenWhitelist(tokenContract1.address, true)).wait();
  await (await mainContract.connect(ownerSigner).updatePaymentTokenWhitelist(tokenContract2.address, true)).wait();

  // 25% => 0.25 => 0.25e18
  await (await mainContract.connect(ownerSigner).setPlatformFeeRate_e18(250000_000000_000000n)).wait();

  return mainContract;
}
