import assert from 'assert';
import { ethers } from 'hardhat';
import { deployAndInitialize, toFp18 } from '../helpers';

const {
  CHAIN_ID,
  OWNER_ADDRESS,
  INIT_TOKEN_METADATA_URI_TEMPLATE,
  INIT_PLATFORM_FEE_RATE,
  INIT_PLATFORM_FEE_BENEFICIARY,
} = process.env;

async function main() {

  assert(CHAIN_ID);
  assert(OWNER_ADDRESS);
  assert(INIT_TOKEN_METADATA_URI_TEMPLATE);
  assert(INIT_PLATFORM_FEE_RATE);
  assert(INIT_PLATFORM_FEE_BENEFICIARY);

  const { chainId } = await ethers.provider.getNetwork();
  assert(parseInt(CHAIN_ID) === chainId, `${CHAIN_ID} !== ${chainId}; wrong .env config?`);

  const ownerSigner = await ethers.getSigner(OWNER_ADDRESS);

  await deployAndInitialize(ownerSigner, {
    tokenMetadataUriTemplate: INIT_TOKEN_METADATA_URI_TEMPLATE,
    platformFeeRate_e18: toFp18(INIT_PLATFORM_FEE_RATE),
    platformFeeBeneficiary: INIT_PLATFORM_FEE_BENEFICIARY,
  }, { forceNonce: true });
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
