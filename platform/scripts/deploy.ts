import assert from 'assert';
import { ethers } from 'hardhat';
import { DoubleDice__factory, DummyUSDCoin__factory } from '../typechain-types';

const {
  OWNER_ADDRESS,
  FEE_BENEFICIARY_ADDRESS,
  CHAIN_ID
} = process.env;

async function main() {

  const { chainId } = await ethers.provider.getNetwork();
  assert(parseInt(CHAIN_ID) === chainId, `${CHAIN_ID} !== ${chainId}; wrong .env config?`);

  const ownerSigner = await ethers.getSigner(OWNER_ADDRESS);

  const tokenContract = await new DummyUSDCoin__factory(ownerSigner).deploy({ nonce: 0 });
  process.stdout.write(`Deploying token contract to: ${tokenContract.address}...\n`);
  await tokenContract.deployed();

  const mainContract = await new DoubleDice__factory(ownerSigner).deploy(
    'http://localhost:8080/token/{id}',
    tokenContract.address,
    FEE_BENEFICIARY_ADDRESS,
    { nonce: 1 }
  );
  process.stdout.write(`Deploying main  contract to: ${mainContract.address}...\n`);
  await mainContract.deployed();
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
