import { Contract, BigNumber } from 'ethers';

export async function getTotalSupply(contract: Contract): Promise<number> {
  const atto: BigNumber = await contract.totalSupply();
  const supply: number = Math.ceil(atto.div(1e6.toString()).toNumber());
  return supply;
}

export const zipArrays = <A, B>(aaa: A[], bbb: B[]): [A, B][] => {
  if (aaa.length === 0 || bbb.length === 0) {
    return [];
  } else {
    const [[a, ...aa], [b, ...bb]] = [aaa, bbb];
    return [[a, b], ...zipArrays(aa, bb)];
  }
};
