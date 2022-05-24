/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable indent */
// Note: Despite the .ts file extension, this is AssemblyScript not TypeScript!

import { BigDecimal, BigInt } from '@graphprotocol/graph-ts';

export const bigIntFixedPointToBigDecimal = (bigIntFixedPoint: BigInt, decimals: i32): BigDecimal => {
  const bigIntDivisor = BigInt.fromU32(10).pow(u8(decimals));
  const bigDecimalDivisor = new BigDecimal(bigIntDivisor);
  const bigDecimalDividend = new BigDecimal(bigIntFixedPoint);
  return bigDecimalDividend.div(bigDecimalDivisor);
};
