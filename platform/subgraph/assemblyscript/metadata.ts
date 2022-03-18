import {
  Bytes,
  ethereum,
  log
} from '@graphprotocol/graph-ts';
import {
  VirtualFloorCreationMetadataStruct
} from '../../generated/DoubleDice/DoubleDice';
import {
  VirtualFloorMetadataV1Struct
} from '../../generated/DoubleDice/IMetadataVersionsMock';

const METADATA_V1_ABI = '(string,string,string,string,bool,(string,string)[],(string)[],(string,string)[],string)';

export function decodeMetadata(wrappedMetadata: VirtualFloorCreationMetadataStruct): VirtualFloorMetadataV1Struct {
  const encoded = wrappedMetadata.data;

  if (wrappedMetadata.version == Bytes.fromHexString('0x0000000000000000000000000000000000000000000000000000000000000001')) {
    const decodedV1: ethereum.Value = assert(ethereum.decode(METADATA_V1_ABI, encoded));
    const metadataV1 = changetype<VirtualFloorMetadataV1Struct>(decodedV1.toTuple());
    return metadataV1;
  } else {
    log.critical('Metadata version {} not supported', [wrappedMetadata.version.toHex()]);
    throw new Error(`Error: Metadata version ${wrappedMetadata.version.toHex()} not supported`);
  }
}