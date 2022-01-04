import '@nomiclabs/hardhat-ethers';
import '@nomiclabs/hardhat-waffle';
import '@typechain/hardhat';
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

export default <HardhatUserConfig>{
  abiExporter: {
    clear: true,
    flat: true,
    only: [
      ':DoubleDice$',
      ':DummyUSDCoin$',
    ],
    runOnCompile: true,
  },
  networks: {
    hardhat: {
      chainId: 31337,
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
};