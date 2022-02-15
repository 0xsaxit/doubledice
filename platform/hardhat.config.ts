import '@nomiclabs/hardhat-ethers';
import '@nomiclabs/hardhat-waffle';
import '@typechain/hardhat';
import assert from 'assert';
import dotenv from 'dotenv';
import 'hardhat-abi-exporter';
import 'hardhat-gas-reporter';
import { HardhatUserConfig } from 'hardhat/types';

const dotenvResult = dotenv.config();
if (dotenvResult.error) {
  throw dotenvResult.error;
}

const {
  PROVIDER_URL,
  OWNER_PRIVATE_KEY,
} = process.env;

assert(OWNER_PRIVATE_KEY);

const config: HardhatUserConfig = {
  abiExporter: {
    clear: true,
    flat: true,
    only: [
      ':DoubleDice$',
      ':IDoubleDice$',
      ':IDoubleDiceAdmin$',
      ':DummyUSDCoin$',
      ':IERC20Metadata$',
    ],
    runOnCompile: true,
  },
  networks: {
    hardhat: {
      chainId: 1337,
    },
    ganache: {
      chainId: 1337,
      url: 'http://localhost:8545',
    },
    rinkeby: {
      url: PROVIDER_URL,
      accounts: [OWNER_PRIVATE_KEY],
      chainId: 4,
    },
    mumbai: {
      url: PROVIDER_URL,
      accounts: [OWNER_PRIVATE_KEY],
      chainId: 80001,
    },
  },
  solidity: {
    version: '0.8.11',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  typechain: {
    externalArtifacts: [
      'node_modules/@openzeppelin/contracts/build/contracts/ProxyAdmin.json',
      'node_modules/@openzeppelin/contracts/build/contracts/TransparentUpgradeableProxy.json',
    ],
    outDir: 'lib/generated/typechain-types'
  },
  gasReporter: {
    outputFile: 'gas-report.txt',
    noColors: true,
    excludeContracts: ['mock/'],
  },
};

export default config;