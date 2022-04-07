/* eslint-disable indent */
// Note: Despite the .ts file extension, this is AssemblyScript not TypeScript!

import { BigDecimal, BigInt } from '@graphprotocol/graph-ts';

export const toBigDecimal = (wei: BigInt, decimals: i32 = 18): BigDecimal => wei.divDecimal(new BigDecimal(BigInt.fromU32(10).pow(u8(decimals))));
