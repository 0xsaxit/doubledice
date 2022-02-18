import { BigNumberish } from 'ethers';
import { SignerWithAddress } from '.';
import { DoubleDice, DoubleDice__factory, DummyUSDCoin__factory, DummyWrappedBTC__factory, ProxyAdmin__factory, TransparentUpgradeableProxy__factory } from '../lib/contracts';

export interface DeploymentParams {
  tokenMetadataUriTemplate: string,
  platformFeeRate_e18: BigNumberish,
  platformFeeBeneficiary: string,
}

export interface DeploymentOptions {
  forceNonce: boolean;
}

// Here we could simply use @openzeppelin/hardhat-upgrades deployProxy function,
// but it does not work yet,
// compilation fails with error "Error: No node with id 5102 of type StructDefinition,EnumDefinition"
// Probably because user-defined value types are not yet supported:
// https://github.com/OpenZeppelin/openzeppelin-upgrades/issues/477
// This replacement can be dropped as soon as there is support
const mimicHardhatUpgradesDeployProxy = async (
  ownerSigner: SignerWithAddress,
  deploymentArgs: DeploymentParams,
  forceNonce: boolean
) => {
  const impl = await new DoubleDice__factory(ownerSigner).deploy(forceNonce ? { nonce: 0 } : {});
  process.stdout.write(`Deploying DoubleDice impl to: ${impl.address}...\n`);
  await impl.deployed();

  const proxyAdmin = await new ProxyAdmin__factory(ownerSigner).deploy();
  process.stdout.write(`Deploying ProxyAdmin to: ${proxyAdmin.address}...\n`);
  await proxyAdmin.deployed();

  const {
    tokenMetadataUriTemplate,
    platformFeeRate_e18,
    platformFeeBeneficiary,
  } = deploymentArgs;


  const proxy = await new TransparentUpgradeableProxy__factory(ownerSigner).deploy(
    impl.address,
    proxyAdmin.address,
    impl.interface.encodeFunctionData('initialize', [
      tokenMetadataUriTemplate,
      platformFeeRate_e18,
      platformFeeBeneficiary,
    ])
  );

  process.stdout.write(`Deploying DoubleDice proxy to: ${proxy.address}...\n`);
  await proxy.deployed();

  return DoubleDice__factory.connect(proxy.address, ownerSigner);
};

export async function deployAndInitialize(
  ownerSigner: SignerWithAddress,
  deploymentArgs: DeploymentParams,
  deploymentOptions?: DeploymentOptions
): Promise<DoubleDice> {
  const { forceNonce = false } = deploymentOptions || {};

  const mainContract = await mimicHardhatUpgradesDeployProxy(ownerSigner, deploymentArgs, forceNonce);

  const tokenContract1 = await new DummyUSDCoin__factory(ownerSigner).deploy();
  process.stdout.write(`Deploying USDC contract to: ${tokenContract1.address}...\n`);
  await tokenContract1.deployed();

  const tokenContract2 = await new DummyWrappedBTC__factory(ownerSigner).deploy();
  process.stdout.write(`Deploying WBTC contract to: ${tokenContract2.address}...\n`);
  await tokenContract2.deployed();

  await (await mainContract.connect(ownerSigner).updatePaymentTokenWhitelist(tokenContract1.address, true)).wait();
  await (await mainContract.connect(ownerSigner).updatePaymentTokenWhitelist(tokenContract2.address, true)).wait();

  return mainContract;
}
