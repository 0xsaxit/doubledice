import { Contract, BigNumber } from 'ethers';
import { APP_ORIGIN, DD_ENV } from './config';

export async function getTotalSupply(contract: Contract): Promise<number> {
  const atto: BigNumber = await contract.totalSupply();
  const supply: number = Math.ceil(atto.div(1e6.toString()).toNumber());
  return supply;
}

export const zipArrays2 = <A, B>(aaa: A[], bbb: B[]): [A, B][] => {
  if (aaa.length === 0 || bbb.length === 0) {
    return [];
  } else {
    const [[a, ...aa], [b, ...bb]] = [aaa, bbb];
    return [[a, b], ...zipArrays2(aa, bb)];
  }
};

export const zipArrays3 = <A, B, C>(aaa: A[], bbb: B[], ccc: C[]): [A, B, C][] => {
  if (aaa.length === 0 || bbb.length === 0 || ccc.length === 0) {
    return [];
  } else {
    const [[a, ...aa], [b, ...bb], [c, ...cc]] = [aaa, bbb, ccc];
    return [[a, b, c], ...zipArrays3(aa, bb, cc)];
  }
};

export const constructVfUrl = (intId: string) => {
  if (DD_ENV === 'dev') {
    return `${APP_ORIGIN}/bet/#!/${intId}`;
  } else {
    return `${APP_ORIGIN}/bet/${intId}`;
  }
};
