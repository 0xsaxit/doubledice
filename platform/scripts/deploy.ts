import assert from 'assert';
import { ethers } from 'hardhat';
import { DoubleDice__factory, DummyUSDCoin__factory, DummyWrappedBTC__factory } from '../lib/contracts';

const {
  OWNER_ADDRESS,
  FEE_BENEFICIARY_ADDRESS,
  CHAIN_ID
} = process.env;

async function main() {

  assert(CHAIN_ID);
  assert(OWNER_ADDRESS);
  assert(FEE_BENEFICIARY_ADDRESS);

  const { chainId } = await ethers.provider.getNetwork();
  assert(parseInt(CHAIN_ID) === chainId, `${CHAIN_ID} !== ${chainId}; wrong .env config?`);

  const ownerSigner = await ethers.getSigner(OWNER_ADDRESS);

  const tokenContract1 = await new DummyUSDCoin__factory(ownerSigner).deploy({ nonce: 0 });
  process.stdout.write(`Deploying USDC contract to: ${tokenContract1.address}...\n`);
  await tokenContract1.deployed();

  const mainContract = await new DoubleDice__factory(ownerSigner).deploy(
    'http://localhost:8080/token/{id}',
    FEE_BENEFICIARY_ADDRESS,
    { nonce: 1 }
  );
  process.stdout.write(`Deploying main  contract to: ${mainContract.address}...\n`);
  await mainContract.deployed();

  const tokenContract2 = await new DummyWrappedBTC__factory(ownerSigner).deploy({ nonce: 2 });
  process.stdout.write(`Deploying WBTC contract to: ${tokenContract2.address}...\n`);
  await tokenContract2.deployed();

  await (await mainContract.connect(ownerSigner).updatePaymentTokenWhitelist(tokenContract1.address, true)).wait();
  await (await mainContract.connect(ownerSigner).updatePaymentTokenWhitelist(tokenContract2.address, true)).wait();

  // 25% => 0.25 => 0.25e18
  await (await mainContract.connect(ownerSigner).setPlatformFeeRate_e18(250000_000000_000000n)).wait();
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
