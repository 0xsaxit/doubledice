// See https://doubledice.slack.com/archives/C03903Y2FPX/p1650120516164829

import assert from 'assert';
import { ethers } from 'hardhat';
// https://unpkg.com/quickswap-default-token-list@1.2.27/build/quickswap-default.tokenlist.json
import { tokens as quickswapTokens } from './quickswap-default.tokenlist.json';
import { tokens as extraTokens } from './extra.tokenlist.json';
import { DoubleDice__factory } from '../lib/contracts';

const {
  CHAIN_ID,
  OWNER_ADDRESS: DOUBLEDICE_CONTRACT_ADMIN_ADDRESS,
  DOUBLEDICE_CONTRACT_ADDRESS,
} = process.env;

const containsDuplicates = (values: string[]) => new Set(values).size !== values.length;

const symbolsToWhitelist = [
  'AAVE',
  'AVAX',
  'BNB',
  'CRV',
  'DAI',
  'DODI',
  'ELON',
  'ETH',
  'GRT',
  'LINK',
  'MANA',
  'mOCEAN',
  'SHIB',
  'UNI',
  'USDC',
  'USDT',
  'WBTC',
  'WMATIC',
  'YFI',
  'ZRX',
];

async function main() {

  assert(CHAIN_ID);
  assert(DOUBLEDICE_CONTRACT_ADDRESS);
  assert(DOUBLEDICE_CONTRACT_ADMIN_ADDRESS);

  const targetChainId = parseInt(CHAIN_ID);
  assert(targetChainId === 137, 'This script is intended to be run against Polygon network; configure .env correctly');

  const { chainId } = await ethers.provider.getNetwork();
  assert(chainId === targetChainId, `${chainId} !== ${targetChainId}; wrong .env config?`);

  const ddAdmin = await ethers.getSigner(DOUBLEDICE_CONTRACT_ADMIN_ADDRESS);

  assert(!containsDuplicates(symbolsToWhitelist), 'List of symbols to whitelist contains duplicates');

  const tokens = [...quickswapTokens, ...extraTokens]
    .filter(({ chainId }) => chainId === targetChainId)
    .filter(({ symbol }) => symbolsToWhitelist.includes(symbol));
  assert(!containsDuplicates(tokens.map(({ symbol }) => symbol)), 'Token symbols not unique, cannot be used as key');

  const filteredTokens = new Map(tokens.filter(({ chainId }) => chainId == targetChainId).map(({ symbol, ...rest }) => [symbol, { symbol, ...rest }]));

  for (const symbol of symbolsToWhitelist) {
    const token = filteredTokens.get(symbol);
    if (token) {
      const { name, address, decimals } = token;
      console.log(`https://polygonscan.com/token/${address} ${symbol.padStart(10)} ${name.padEnd(20)} ${decimals.toString().padStart(2)} `);
    } else {
      console.log(`Unknown symbol ${symbol}`);
    }
  }

  const ddContract = DoubleDice__factory.connect(DOUBLEDICE_CONTRACT_ADDRESS, ddAdmin);

  for (const symbol of symbolsToWhitelist) {
    const token = filteredTokens.get(symbol);
    assert(token);
    const { address } = token;
    const isWhitelisted = await ddContract.isPaymentTokenWhitelisted(address);
    const name = `${symbol}(${address})`;
    if (isWhitelisted) {
      console.log(`Skipping ${name} because it is already whitelisted on DoubleDice(${DOUBLEDICE_CONTRACT_ADDRESS})`);
    } else {
      console.log(`Whitelisting ${name} on DoubleDice(${DOUBLEDICE_CONTRACT_ADDRESS})...`);
      const tx = await ddContract.updatePaymentTokenWhitelist(address, true);
      console.log(`Sent transaction: ${tx.hash}`);
      await tx.wait();
    }
  }

}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
