import assert from 'assert';
import { ethers } from 'hardhat';
import { deployAndInitialize } from '../helpers';

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

  await deployAndInitialize(ownerSigner, { FEE_BENEFICIARY_ADDRESS }, { forceNonce: true });
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
