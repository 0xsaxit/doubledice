import assert from 'assert';
import { BytesLike } from 'ethers';
import { SignerWithAddress } from '.';
import {
  DoubleDice,
  DoubleDice__factory,
  DummyUSDCoin,
  DummyUSDCoin__factory,
  DummyWrappedBTC,
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

export async function deployDummyUSDCoin(deployer: SignerWithAddress): Promise<DummyUSDCoin> {
  const tokenContract1 = await new DummyUSDCoin__factory(deployer).deploy();
  process.stdout.write(`Deploying USDC contract to: ${tokenContract1.address}...\n`);
  await tokenContract1.deployed();
  return tokenContract1;
}

export async function deployDummyWrappedBTC(deployer: SignerWithAddress): Promise<DummyWrappedBTC> {
  const tokenContract2 = await new DummyWrappedBTC__factory(deployer).deploy();
  process.stdout.write(`Deploying WBTC contract to: ${tokenContract2.address}...\n`);
  await tokenContract2.deployed();
  return tokenContract2;
}

export async function deployDoubleDice({
  deployer,
  deployArgs,
  initializeArgs
}: {
  deployer: SignerWithAddress;
  deployArgs: Parameters<DoubleDice__factory['deploy']>;
  initializeArgs: [Parameters<DoubleDice['initialize']>[0], Parameters<DoubleDice['initialize']>[1]]; // No TypeScript magic can do this for now
}): Promise<DoubleDice> {
  const impl = await new DoubleDice__factory(deployer).deploy(...deployArgs);
  console.log(`Deploying DoubleDice impl to: ${impl.address}...`);
  await impl.deployed();
  const encodedInitializerData = impl.interface.encodeFunctionData('initialize', initializeArgs);
  const proxyAddress = await deployProxy(deployer, impl.address, encodedInitializerData);
  const contract = DoubleDice__factory.connect(proxyAddress, deployer);

  console.log(`Granting OPERATOR_ROLE to admin ${deployer.address}`);
  await (await contract.grantRole(await contract.OPERATOR_ROLE(), deployer.address)).wait();

  console.log(`Granting quota of 100 rooms to admin ${deployer.address}`);
  await (await contract.adjustCreationQuotas([{ creator: deployer.address, relativeAmount: 100 }])).wait();

  return contract;
}
