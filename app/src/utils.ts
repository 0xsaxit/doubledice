import { BigNumber as BigDecimal } from 'bignumber.js'

export const flatten = <T>(arrays: T[][]): T[] => Array.prototype.concat(...arrays)

export const tryCatch = async (func: () => Promise<void>): Promise<void> => {
  try {
    await func()
  } catch (e: any) {
    if (e.code && e.code === -32603 && e.data && e.data.message) {
      alert(e.data.message)
    } else {
      throw e
    }
  }
}

export const formatTimestamp = (timestamp: string | number): string => {
  return new Date(parseInt(timestamp.toString()) * 1000).toISOString().slice(0, 19).replace(/-/g, '\u2011')
}

export const sumBigDecimals = (values: BigDecimal[]): BigDecimal => {
  return values.reduce((a: BigDecimal, b: BigDecimal) => a.plus(b), new BigDecimal(0))
}

export const sumNumbers = (values: number[]): number => {
  return values.reduce((a: number, b: number) => a + b, 0)
}

export const getSystemTimestamp = (): number => Math.floor(Date.now() / 1000)

export function zipArrays1<A>(aaa: A[]): [A][] {
  if (aaa.length === 0) {
    return []
  } else {
    const [[a, ...aa]] = [aaa]
    return [[a], ...zipArrays1(aa)]
  }
}

export function zipArrays2<A, B>(aaa: A[], bbb: B[]): [A, B][] {
  if (aaa.length === 0 || bbb.length === 0) {
    return []
  } else {
    const [[a, ...aa], [b, ...bb]] = [aaa, bbb]
    return [[a, b], ...zipArrays2(aa, bb)]
  }
}
