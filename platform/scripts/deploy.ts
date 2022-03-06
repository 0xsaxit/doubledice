import assert from 'assert';
import { ethers } from 'hardhat';
import {
  deployDoubleDice,
  deployDummyUSDCoin,
  deployDummyWrappedBTC,
  toFp18
} from '../helpers';
import {
  DummyUSDCoin,
  DummyUSDCoin__factory,
  DummyWrappedBTC,
  DummyWrappedBTC__factory
} from '../lib/contracts';

const {
  CHAIN_ID,
  OWNER_ADDRESS,
  INIT_TOKEN_METADATA_URI_TEMPLATE,
  INIT_PLATFORM_FEE_RATE,
  INIT_PLATFORM_FEE_BENEFICIARY,
  DEPLOYED_USDC_ADDRESS = null,
  DEPLOYED_WBTC_ADDRESS = null
} = process.env;

async function main() {

  assert(CHAIN_ID);
  assert(OWNER_ADDRESS);
  assert(INIT_TOKEN_METADATA_URI_TEMPLATE);
  assert(INIT_PLATFORM_FEE_RATE);
  assert(INIT_PLATFORM_FEE_BENEFICIARY);

  const { chainId } = await ethers.provider.getNetwork();
  assert(parseInt(CHAIN_ID) === chainId, `${CHAIN_ID} !== ${chainId}; wrong .env config?`);

  const deployer = await ethers.getSigner(OWNER_ADDRESS);

  let tokenUSDC: DummyUSDCoin;
  if (DEPLOYED_USDC_ADDRESS) {
    tokenUSDC = DummyUSDCoin__factory.connect(DEPLOYED_USDC_ADDRESS, deployer);
  } else {
    tokenUSDC = await deployDummyUSDCoin(deployer);
  }

  let tokenWBTC: DummyWrappedBTC;
  if (DEPLOYED_WBTC_ADDRESS) {
    tokenWBTC = DummyWrappedBTC__factory.connect(DEPLOYED_WBTC_ADDRESS, deployer);
  } else {
    tokenWBTC = await deployDummyWrappedBTC(deployer);
  }

  const contract = await deployDoubleDice({
    deployer: deployer,
    deployArgs: [],
    initializeArgs: [
      {
        tokenMetadataUriTemplate: INIT_TOKEN_METADATA_URI_TEMPLATE,
        platformFeeRate_e18: toFp18(INIT_PLATFORM_FEE_RATE),
        platformFeeBeneficiary: INIT_PLATFORM_FEE_BENEFICIARY,
      },
      tokenUSDC.address,
    ]
  });

  console.log(`Whitelisting USDC@${tokenUSDC.address} on DoubleDice contract`);
  await ((await contract.updatePaymentTokenWhitelist(tokenUSDC.address, true)).wait());

  console.log(`Whitelisting WBTC@${tokenWBTC.address} on DoubleDice contract`);
  await ((await contract.updatePaymentTokenWhitelist(tokenWBTC.address, true)).wait());
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
