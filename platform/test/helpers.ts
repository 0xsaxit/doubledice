import assert from 'assert';
import { ethers } from 'hardhat';
import { deployProxy, SignerWithAddress } from '../helpers';
import { BaseDoubleDiceInitParamsStruct, SimpleOracle, SimpleOracle__factory } from '../lib/contracts';


// https://stackoverflow.com/questions/62282408/how-to-extend-mochas-context-interface
declare module 'mocha' {
  export interface Context {
    evmSnapshot: string;
  }
}

export const setupSnapshotHooks = () => {

  beforeEach(async function () {
    this.evmSnapshot = await ethers.provider.send('evm_snapshot', []);
  });

  afterEach(async function () {
    assert(await ethers.provider.send('evm_revert', [this.evmSnapshot]));
  });

};

export const deploySimpleOracle = async (deployer: SignerWithAddress, baseParams: BaseDoubleDiceInitParamsStruct): Promise<SimpleOracle> => {
  const impl = await new SimpleOracle__factory(deployer).deploy();
  await impl.deployed();
  const proxyAddress = await deployProxy({
    deployer,
    deployedImplAddress: impl.address,
    encodedInitializerData: impl.interface.encodeFunctionData('initialize', [baseParams]),
  });
  return SimpleOracle__factory.connect(proxyAddress, deployer);
};

// ToDo: Drop this function when hardhat-waffle typed revertWith starts to exist
export const getError = async (promise: Promise<unknown>): Promise<any> => {
  try {
    await promise;
  } catch (e: any) {
    return e;
  }
  throw new Error('Was expecting error to be thrown');
};
