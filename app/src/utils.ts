import { BigNumber as BigDecimal } from 'bignumber.js'
import { ethers } from 'ethers'
import * as ipfs from 'ipfs-http-client'

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

export const sum = (values: BigDecimal[]): BigDecimal => {
  return values.reduce((a: BigDecimal, b: BigDecimal) => a.plus(b), new BigDecimal(0))
}

export const getSystemTimestamp = (): number => Math.floor(Date.now() / 1000)

export const createRoomEventInfo = async (): Promise<any> => {
  const roomEventInfo = {
    category: 'sports',
    subcategory: 'football',
    title: 'Finland vs. Argentina',
    description: 'Finland vs. Argentina FIFA 2022 world cup final',
    isListed: false,
    opponents: [
      { title: 'Finland', image: 'https://upload.wikimedia.org/wikipedia/commons/3/31/Huuhkajat_logo.svg' },
      { title: 'Argentina', image: 'https://upload.wikimedia.org/wikipedia/en/c/c1/Argentina_national_football_team_logo.svg' }
    ],
    outcomes: [
      { index: 0, title: 'Finland win' },
      { index: 1, title: 'Argentina win' },
      { index: 2, title: 'Tie' }
    ],
    resultSources: [
      { title: 'Official FIFA result page', url: 'http://fifa.com/argentina-vs-finland' }
    ]
  }
  return roomEventInfo
}

export const submitRoomEventInfo = async (roomEventInfo: any): Promise<string> => {
  const ipfsClient = ipfs.create({
    host: 'localhost',
    port: 5001
  })
  const content = JSON.stringify(roomEventInfo, null, 2)
  // Will fail with "ReferenceError: AbortController is not defined" if you aren't using NodeJS v16
  const { cid } = await ipfsClient.add(content, {
    rawLeaves: true // otherwise multihash will not be exact sha256 of content
  })
  const metadataHash = ethers.utils.hexlify(cid.multihash.digest)
  console.log(`room-event-info added to ipfs with hash ${metadataHash}`)
  return metadataHash
}
