export * from './generated/typechain-types';
export * from './generated/typechain-types/IDoubleDice';
export * from './generated/typechain-types/IVirtualFloorMetadataVersionsMock';
export * from './helpers/sol-enums';
export type { VirtualFloorMetadataV1Struct as RoomEventInfo };

import { ethers } from 'ethers';
import { IVirtualFloorMetadataVersionsMock__factory } from './generated/typechain-types';
import { EncodedVirtualFloorMetadataStruct } from './generated/typechain-types/IDoubleDice';
import { VirtualFloorMetadataV1Struct } from './generated/typechain-types/IVirtualFloorMetadataVersionsMock';

export const encodeVirtualFloorMetadata = (metadata: VirtualFloorMetadataV1Struct): EncodedVirtualFloorMetadataStruct => {
  const encodedFunctionData = IVirtualFloorMetadataVersionsMock__factory.createInterface().encodeFunctionData('v1', [metadata]);
  return {
    version: ethers.utils.hexZeroPad('0x01', 32),
    data: ethers.utils.hexDataSlice(encodedFunctionData, 4)
  };
};
