export * from './generated/typechain-types';
export * from './generated/typechain-types/IDoubleDice';
export * from './generated/typechain-types/IVirtualFloorMetadataVersionsMock';
export * from './helpers/sol-enums';
export type { VirtualFloorMetadataV1Struct as RoomEventInfo };

import { BytesLike, ethers } from 'ethers';
import { Result } from 'ethers/lib/utils';
import { DoubleDice__factory, IVirtualFloorMetadataVersionsMock__factory } from './generated/typechain-types';
import { EncodedVirtualFloorMetadataStruct } from './generated/typechain-types/IDoubleDice';
import { VirtualFloorMetadataV1Struct } from './generated/typechain-types/IVirtualFloorMetadataVersionsMock';

export const encodeVirtualFloorMetadata = (metadata: VirtualFloorMetadataV1Struct): EncodedVirtualFloorMetadataStruct => {
  const encodedFunctionData = IVirtualFloorMetadataVersionsMock__factory.createInterface().encodeFunctionData('v1', [metadata]);
  return {
    version: ethers.utils.hexZeroPad('0x01', 32),
    data: ethers.utils.hexDataSlice(encodedFunctionData, 4)
  };
};

type DecodedDoubleDiceCustomErrorData = {
  name: string;
  formattedArgs: string;
}

export const decodeDoubleDiceCustomErrorData = (encodedErrorData: BytesLike): DecodedDoubleDiceCustomErrorData | null => {
  const doubleDiceInterface = DoubleDice__factory.createInterface();
  for (const errorFragment of Object.values(doubleDiceInterface.errors)) {
    let result: Result;
    try {
      result = doubleDiceInterface.decodeErrorResult(errorFragment, encodedErrorData);
    } catch (e: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      if ('reason' in e && /^data signature does not match error/.test(e.reason)) {
        continue;
      } else {
        return null;
      }
    }
    const formattedArgs = Object.entries(result)
      .filter(([name]) => !/^\d+$/.test(name)) // filter out numeric keys
      .map(([name, value]) => `${name}=${value}`)
      .join(',');
    return {
      name: errorFragment.name,
      formattedArgs,
    };
  }
  return null;
};
