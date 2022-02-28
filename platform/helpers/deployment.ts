import assert from 'assert';
import { BigNumberish, BytesLike } from 'ethers';
import { SignerWithAddress } from '.';
import {
  BaseDoubleDice,
  DummyUSDCoin__factory,
  DummyWrappedBTC__factory,
  ProxyAdmin__factory,
  TransparentUpgradeableProxy__factory
} from '../lib/contracts';

// Here we could simply use @openzeppelin/hardhat-upgrades deployProxy function,
// but it does not work yet,
// compilation fails with error "Error: No node with id 5102 of type StructDefinition,EnumDefinition"
// Probably because user-defined value types are not yet supported:
// https://github.com/OpenZeppelin/openzeppelin-upgrades/issues/477
// This replacement can be dropped as soon as there is support

export const deployProxy = async (
  deployerSigner: SignerWithAddress,
  deployedImplAddress: string,
  encodedInitializerData: BytesLike,
  forceNonce = false
): Promise<string> => {

  if (forceNonce) {
    // Deployer account should have deployed only impl, so tx-count should be 1
    const deployerTxCount = await deployerSigner.getTransactionCount();
    assert(deployerTxCount == 1, `Nonce for deployer ${deployerSigner.address} = ${deployerTxCount} != 1`);
  }

  const proxyAdmin = await new ProxyAdmin__factory(deployerSigner).deploy();
  process.stdout.write(`Deploying ProxyAdmin to: ${proxyAdmin.address}...\n`);
  await proxyAdmin.deployed();

  const proxy = await new TransparentUpgradeableProxy__factory(deployerSigner).deploy(
    deployedImplAddress,
    proxyAdmin.address,
    encodedInitializerData
  );

  process.stdout.write(`Deploying DoubleDice proxy to: ${proxy.address}...\n`);
  await proxy.deployed();

  return proxy.address;
};

type DoubleDiceLike = Pick<BaseDoubleDice, 'updatePaymentTokenWhitelist'>

export async function deployDummiesAndSetUp(deployerSigner: SignerWithAddress, mainContract: DoubleDiceLike): Promise<void> {
  const tokenContract1 = await new DummyUSDCoin__factory(deployerSigner).deploy();
  process.stdout.write(`Deploying USDC contract to: ${tokenContract1.address}...\n`);
  await tokenContract1.deployed();

  const tokenContract2 = await new DummyWrappedBTC__factory(deployerSigner).deploy();
  process.stdout.write(`Deploying WBTC contract to: ${tokenContract2.address}...\n`);
  await tokenContract2.deployed();

  await (await mainContract.updatePaymentTokenWhitelist(tokenContract1.address, true)).wait();
  await (await mainContract.updatePaymentTokenWhitelist(tokenContract2.address, true)).wait();
}
