import assert from 'assert';
import { ethers } from 'hardhat';
import {
  deployTestCoin
} from '../helpers';
import {
  DoubleDice__factory,
  DummyERC20
} from '../lib/contracts';

const {
  CHAIN_ID,
  OWNER_ADDRESS: DOUBLEDICE_CONTRACT_ADMIN_ADDRESS,
  MAINNET_TESTCOIN_DEPLOYER_ADDRESS,
  DOUBLEDICE_CONTRACT_ADDRESS,
  MAINNET_TESTCOIN_BANK_ADDRESS,
} = process.env;

async function main() {

  assert(CHAIN_ID);
  assert(DOUBLEDICE_CONTRACT_ADDRESS);
  assert(DOUBLEDICE_CONTRACT_ADMIN_ADDRESS);
  assert(MAINNET_TESTCOIN_DEPLOYER_ADDRESS);
  assert(MAINNET_TESTCOIN_BANK_ADDRESS);

  const { chainId } = await ethers.provider.getNetwork();
  assert(parseInt(CHAIN_ID) === chainId, `${CHAIN_ID} !== ${chainId}; wrong .env config?`);

  const ddAdmin = await ethers.getSigner(DOUBLEDICE_CONTRACT_ADMIN_ADDRESS);
  const deployer = await ethers.getSigner(MAINNET_TESTCOIN_DEPLOYER_ADDRESS);

  const allDecimals = [6, 8, 18];

  const contracts = [] as DummyERC20[];
  for (const decimals of allDecimals) {
    contracts.push(await deployTestCoin(deployer, decimals));
  }

  for (const contract of contracts) {
    const amount = 1_000_000_000n;
    const decimals = await contract.decimals();
    process.stdout.write(`Minting  ${amount} ${await contract.symbol()} to Bank(${MAINNET_TESTCOIN_BANK_ADDRESS}) on ${await contract.name()}(${contract.address})\n`);
    const tx = await contract.mint(MAINNET_TESTCOIN_BANK_ADDRESS, amount * (10n ** BigInt(decimals)));
    process.stdout.write(`Sent transaction: ${tx.hash}\n`);
    await tx.wait();
  }

  const ddContract = DoubleDice__factory.connect(DOUBLEDICE_CONTRACT_ADDRESS, ddAdmin);
  for (const contract of contracts) {
    process.stdout.write(`Whitelisting ${await contract.name()}(${contract.address}) on DoubleDice contract\n`);
    const tx = await ddContract.updatePaymentTokenWhitelist(contract.address, true);
    process.stdout.write(`Sent transaction: ${tx.hash}\n`);
    await tx.wait();
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
