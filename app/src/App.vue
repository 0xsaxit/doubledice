<template>
  <img style="height: 100px" alt="DoubleDice 🎲🎲" src="./assets/logo.png" />
  <hr />
  <table class="info">
    <tr>
      <th>Network (🦊)</th>
      <td>{{ networkDescription }}</td>
    </tr>
    <tr>
      <th>Last block timestamp</th>
      <td>{{ formatTimestamp(latestBlockTimestamp) }}</td>
    </tr>
    <tr>
      <th>Next block timestamp</th>
      <td>{{ formatTimestamp(nextBlockTimestamp) }}</td>
    </tr>
    <tr>
      <th>Account (🦊)</th>
      <td>{{ account }}</td>
    </tr>
    <tr>
      <th>Owner</th>
      <td>{{ owner }}</td>
    </tr>
    <tr>
      <th>Fee beneficiary</th>
      <td>{{ feeBeneficiary }}</td>
    </tr>
    <tr>
      <th>Token</th>
      <td>
        {{ tokenDescription }}
        <button @click="addToken" title="Add token to MetaMask">+🦊</button>
      </td>
    </tr>
    <tr>
      <th>Balance</th>
      <td>
        {{ balance }}
        <button @click="mintSome">+10</button>
      </td>
    </tr>
    <tr>
      <th>Allowance</th>
      <td>
        {{ allowance }}
        <button @click="increaseAllowance">+10</button>
      </td>
    </tr>
    <tr>
      <th>EVM time</th>
      <td>
        <button @click="fastforward" :disabled="isFastforwarding">⏩</button>
      </td>
    </tr>
  </table>

  <hr />

  <table id="virtual-floors">
    <thead>
      <tr>
        <!-- <th>json</th> -->
        <th>id</th>
        <th>timestamp</th>
        <th>tClose</th>
        <th>tResolve</th>
        <th>state</th>
        <th>totalSupply</th>
        <template v-for="index in maxOutcomeCount" :key="index">
          <th>Outcome № {{ index + 1 }}</th>
        </template>
      </tr>
    </thead>
    <VirtualFloorComponent
      v-for="virtualFloor in virtualFloors"
      :key="virtualFloor.id"
      :contract="contract"
      :virtualFloor="virtualFloor"
      :minVirtualFloorTimestamp="minVirtualFloorTimestamp"
      :maxVirtualFloorTimestamp="maxVirtualFloorTimestamp"
      :maxOutcomes="maxOutcomeCount.length"
      :fastforwarding="isFastforwarding"
      :nextBlockTimestamp="nextBlockTimestamp"
      @balanceChange="refreshBalances"
    />
  </table>

  <!-- <pre style="text-align: left;">{{ JSON.stringify(processedVirtualFloors, null, 2) }}</pre> -->
  <hr />

  <NewVirtualFloor :contract="contract" />
</template>

<script lang="ts">
import { EthereumProvider, EthereumProviderHelper } from '@/mm'
import { formatTimestamp, getSystemTimestamp } from '@/utils'
import { BigNumber as BigDecimal } from 'bignumber.js'
import { ethers, providers } from 'ethers'
import gql from 'graphql-tag'
import { Options, Vue } from 'vue-class-component'
// eslint-disable-next-line camelcase
import { DoubleDice, DoubleDice__factory, ERC20PresetMinterPauser, ERC20PresetMinterPauser__factory } from '../../platform/typechain-types'
import VirtualFloorComponent from './components/VirtualFloorComponent.vue'
import NewVirtualFloor from './components/NewVirtualFloor.vue'
import { VirtualFloor as VirtualFloorEntity } from './generated/graphql'

BigDecimal.config({ DECIMAL_PLACES: 18 })

const MAIN_CONTRACT_ADDRESS = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512'

const VIRTUAL_FLOORS_QUERY = gql`query {
  virtualFloors(
    orderBy: timestamp,
    orderDirection: desc
#    where: {
#      # timestamp_gte: 1638396709
#      #timestamp_gte: $minTimestamp
#    }
  ) {
    id
    timestamp
    tClose
    tResolve
    state
    winningOutcome
    totalSupply
    betaGradient
    outcomes {
      index
      totalSupply
      totalWeightedSupply
      title
      userOutcomes(where: { user: "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266" }) {
        totalBalance
        totalWeightedBalance
      }
      outcomeTimeslots {
        timeslot {
          id
          minTimestamp
        }
        totalSupply
        userOutcomeTimeslots(where: { user: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" }) {
          user { id }
          balance
        }
      }
    }
  }
}`

const delay = (seconds: number) =>
  new Promise(resolve => setTimeout(resolve, seconds * 1000))

const directProvider = new ethers.providers.JsonRpcProvider('http://localhost:8545')

@Options({
  props: {
  },
  components: {
    VirtualFloorComponent,
    NewVirtualFloor
  },
  // watch: {
  //   async latestBlockTimestamp(value: number) {
  //   }
  // },
  apollo: {
    virtualFloors: {
      query: VIRTUAL_FLOORS_QUERY,
      variables: {
        minTimestamp: 1638356708,
        theUser: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266'
      },
      pollInterval: 1
    }
  }
})
export default class App extends Vue {
  virtualFloors!: VirtualFloorEntity[]

  account?: string

  owner?: string

  networkDescription?: string

  tokenDescription?: string

  feeBeneficiary?: string

  beta?: number

  balance: BigDecimal = new BigDecimal(0)
  allowance: BigDecimal = new BigDecimal(0)

  nextBlockTimestamp = 0

  latestBlockTimestamp = 0

  // get latestBlockTimestamp(): number {
  //   return this.latestBlockTimestampInternal
  // }

  // set latestBlockTimestamp(value: number) {
  //   this.latestBlockTimestampInternal = value
  //   this.estimatedNextBlockTimestamp = value
  //   this.systemTimestampAtLastUpdate = getSystemTimestamp()
  // }

  isFastforwarding = false

  isMounted = false

  timeAdjustment = 0

  async fastforward(): Promise<void> {
    if (this.isFastforwarding) {
      return
    }
    this.isFastforwarding = true
    this.timeAdjustment = await directProvider.send('evm_increaseTime', [24 * 60 * 60])
    await directProvider.send('evm_mine', [])
    const { timestamp } = await directProvider.getBlock('latest')
    this.latestBlockTimestamp = timestamp
    this.isFastforwarding = false
  }

  async mintSome(): Promise<void> {
    await (await this.tokenContract.mint(this.account!, 10_000000)).wait()
    await this.refreshBalances()
  }

  async increaseAllowance(): Promise<void> {
    await (await this.tokenContract.increaseAllowance(this.contract.address, 10_000000)).wait()
    this.allowance = new BigDecimal((await this.tokenContract.allowance(this.account!, this.contract.address)).toString()).dividedBy(1_000000)
    await this.refreshBalances()
  }

  contract!: DoubleDice
  tokenContract!: ERC20PresetMinterPauser

  injectedProvider!: providers.Web3Provider

  get maxOutcomeCount(): number[] {
    if (this.virtualFloors === undefined) {
      return []
    }
    const maxOutcomes = Math.max(...this.virtualFloors.map(({ outcomes }) => outcomes.length))
    const out = []
    for (let i = 0; i < maxOutcomes; i++) {
      out.push(i)
    }
    return out
  }

  get minVirtualFloorTimestamp(): number {
    return this.isMounted ? Math.min(this.latestBlockTimestamp, ...this.virtualFloors.map(({ timestamp }) => Number(new BigDecimal(timestamp)))) - 86400 : -Infinity
  }

  get maxVirtualFloorTimestamp(): number {
    return this.isMounted ? Math.max(this.latestBlockTimestamp, ...this.virtualFloors.map(({ tResolve }) => Number(new BigDecimal(tResolve)))) + 86400 : Infinity
  }

  formatTimestamp(timestamp: string | number): string {
    return formatTimestamp(timestamp)
  }

  async mounted(): Promise<void> {
    console.log('Mounted 🐴')

    const ethereum = window.ethereum as EthereumProvider

    const eth = new EthereumProviderHelper(ethereum)

    await eth.init()

    // We must specify the network as 'any' for ethers to allow network changes
    this.injectedProvider = new providers.Web3Provider(ethereum, 'any')

    // Note: This is the only way of "squeezing" this Ganache-internal value out of Ganache
    // See https://github.com/trufflesuite/ganache/blob/v7.0.0-alpha.0/src/chains/ethereum/ethereum/src/blockchain.ts#L713
    this.timeAdjustment = await directProvider.send('evm_increaseTime', [0])

    const { timestamp } = await directProvider.getBlock('latest')
    this.latestBlockTimestamp = timestamp

    setInterval(() => {
      this.nextBlockTimestamp = getSystemTimestamp() + this.timeAdjustment
    }, 1000)

    const signer = this.injectedProvider.getSigner()
    this.account = await signer.getAddress()

    const { name: networkName, chainId: networkChainId } = await this.injectedProvider.getNetwork()
    this.networkDescription = `${networkName}(🔗${networkChainId})`

    const mainContract = DoubleDice__factory.connect(MAIN_CONTRACT_ADDRESS, signer)

    this.contract = mainContract

    this.owner = await mainContract.owner()

    this.feeBeneficiary = await mainContract.feeBeneficiary()

    const tokenAddress = await mainContract._token()

    const tokenContract = ERC20PresetMinterPauser__factory.connect(tokenAddress, signer)

    this.tokenContract = tokenContract

    const tokenName = await tokenContract.name()
    const tokenSymbol = await tokenContract.symbol()
    const tokenDecimals = await tokenContract.decimals()
    // this.tokenDescription = `${tokenName}(${tokenSymbol}, ${1 / (10 ** tokenDecimals)}) ${tokenContract.address}`
    this.tokenDescription = `${tokenName}(${tokenSymbol}, ${1 / (10 ** tokenDecimals)})`

    await this.refreshBalances()

    this.isMounted = true
  }

  async refreshBalances(): Promise<void> {
    console.log('Refreshing balances...')
    this.balance = new BigDecimal((await this.tokenContract.balanceOf(this.account!)).toString()).dividedBy(1_000000)
    this.allowance = new BigDecimal((await this.tokenContract.allowance(this.account!, this.contract.address)).toString()).dividedBy(1_000000)
  }

  async addToken(): Promise<void> {
    const tokenAddress = this.tokenContract.address
    const tokenSymbol = await this.tokenContract.symbol()
    const tokenDecimals = await this.tokenContract.decimals()
    const tokenImage = 'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiIHN0YW5kYWxvbmU9Im5vIj8+CjwhLS0gQ3JlYXRlZCB3aXRoIElua3NjYXBlIChodHRwOi8vd3d3Lmlua3NjYXBlLm9yZy8pIC0tPgoKPHN2ZwogICB3aWR0aD0iNTI5LjE2NjY5bW0iCiAgIGhlaWdodD0iNTI5LjE2NjY5bW0iCiAgIHZpZXdCb3g9IjAgMCA1MjkuMTY2NjkgNTI5LjE2NjY5IgogICB2ZXJzaW9uPSIxLjEiCiAgIGlkPSJzdmc4MDUwMSIKICAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogICB4bWxuczpzdmc9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KICA8ZGVmcwogICAgIGlkPSJkZWZzODA0OTgiIC8+CiAgPGcKICAgICBpZD0ibGF5ZXIxIgogICAgIHRyYW5zZm9ybT0idHJhbnNsYXRlKDE2Ni4wNjk4MiwxNzUuOTIxMTcpIj4KICAgIDxwYXRoCiAgICAgICBkPSJtIDk4LjUxMzUxLDM1My4yNDU0OSBjIDE0Ni42MjQxNCwwIDI2NC41ODMzMywtMTE3Ljk1OTE5IDI2NC41ODMzMywtMjY0LjU4MzMzIDAsLTE0Ni42MjQxNDQgLTExNy45NTkxOSwtMjY0LjU4MzMzIC0yNjQuNTgzMzMsLTI2NC41ODMzMyAtMTQ2LjYyNDE0NCwwIC0yNjQuNTgzMzMsMTE3Ljk1OTE4NiAtMjY0LjU4MzMzLDI2NC41ODMzMyAwLDE0Ni42MjQxNCAxMTcuOTU5MTg2LDI2NC41ODMzMyAyNjQuNTgzMzMsMjY0LjU4MzMzIHoiCiAgICAgICBmaWxsPSIjMjc3NWNhIgogICAgICAgaWQ9InBhdGgyIgogICAgICAgc3R5bGU9ImZpbGw6I2Q0MmUxZTtmaWxsLW9wYWNpdHk6MTtzdHJva2Utd2lkdGg6MC4yNjQ1ODMiIC8+CiAgICA8cGF0aAogICAgICAgZD0ibSAxNzEuMjczOTMsMTMwLjU1MzY0IGMgMCwtMzguNTg0MTg4IC0yMy4xNTEwNSwtNTEuODEzMzU1IC02OS40NTMxMywtNTcuMzI0NjI2IEMgNjguNzQ3ODg1LDY4LjgxODQxIDYyLjEzMzMwMiw1OS45OTk4NDggNjIuMTMzMzAyLDQ0LjU2NDA1NiBjIDAsLTE1LjQzNTc5MSAxMS4wMjUxODcsLTI1LjM1NTAyIDMzLjA3MjkxNiwtMjUuMzU1MDIgMTkuODQzNzUyLDAgMzAuODY4OTQyLDYuNjE0NTgzIDM2LjM4MDIxMiwyMy4xNTEwNDEgMS4xMDMzMSwzLjMwNzI5MiA0LjQxMDYsNS41MTEyNzEgNy43MTc4OSw1LjUxMTI3MSBoIDE3LjYzNzEzIGMgNC40MTA2LDAgNy43MTc4OSwtMy4zMDcyOTIgNy43MTc4OSwtNy43MTUyNSBWIDM5LjA1Mjc4NiBDIDE2MC4yNDg3NCwxNC43OTg0MzIgMTQwLjQwNDk5LC0zLjk0MjAwNTUgMTE1LjA0OTk3LC02LjE0NTk4NDYgViAtMzIuNjA0MzE4IGMgMCwtNC40MTA2MDQgLTMuMzA3MjksLTcuNzE3ODk1IC04LjgxODU2LC04LjgyMTIwOCBIIDg5LjY5NDk0OCBjIC00LjQxMDYwNCwwIC03LjcxNzg5NiwzLjMwNzI5MiAtOC44MjEyMDksOC44MjEyMDggViAtNy4yNDkyOTcxIEMgNDcuODAwODIzLC0yLjgzODY5MyAyNi44NTY0MDcsMTkuMjA5MDM2IDI2Ljg1NjQwNyw0Ni43NzA2ODEgYyAwLDM2LjM4MDIwOCAyMi4wNDc3MjksNTAuNzEwMDQxIDY4LjM0OTgxMSw1Ni4yMjM5NTkgMzAuODY4OTQyLDUuNTExMjcgNDAuNzkwODEyLDEyLjEyNTg1IDQwLjc5MDgxMiwyOS43NjU2MiAwLDE3LjYzOTc3IC0xNS40MzU3OSwyOS43NjU2MyAtMzYuMzgwMjA4LDI5Ljc2NTYzIC0yOC42NjQ5NTcsMCAtMzguNTg2ODMyLC0xMi4xMjg1IC00MS44OTQxMjQsLTI4LjY2NDk2IC0xLjEwMDY2NywtNC40MDc5NiAtNC40MDc5NTgsLTYuNjE0NTggLTcuNzE1MjUsLTYuNjE0NTggSCAzMS4yNjQzNjUgYyAtNC40MDc5NTgsMCAtNy43MTUyNSwzLjMwNzI5IC03LjcxNTI1LDcuNzE3ODkgdiAxLjEwMzMyIGMgNC40MDc5NTgsMjcuNTU4OTkgMjIuMDQ3NzI5LDQ3LjQwMjc0IDU4LjQyNzkzNyw1Mi45MTY2NiB2IDI2LjQ1ODMzIGMgMCw0LjQwNzk2IDMuMzA3MjkyLDcuNzE1MjUgOC44MTg1NjIsOC44MTg1NyBoIDE2LjUzNjQ1NiBjIDQuNDEwNjEsMCA3LjcxNzksLTMuMzA3MjkgOC44MjEyMSwtOC44MTg1NyB2IC0yNi40NTgzMyBjIDMzLjA3MjkyLC01LjUxMzkyIDU1LjEyMDY1LC0yOC42NjQ5NiA1NS4xMjA2NSwtNTguNDMwNTggeiIKICAgICAgIGZpbGw9IiNmZmYiCiAgICAgICBpZD0icGF0aDQiCiAgICAgICBzdHlsZT0iZmlsbDojMWZhZTRhO2ZpbGwtb3BhY2l0eToxO3N0cm9rZS13aWR0aDowLjI2NDU4MyIgLz4KICAgIDxwYXRoCiAgICAgICBkPSJNIDQyLjI4OTU1MiwyNDYuMzA4ODUgQyAtNDMuNzAwMDMsMjE1LjQ0MjU1IC04Ny43OTgxMzMsMTE5LjUzMTEgLTU1LjgyNTg4NCwzNC42NDIxODIgYyAxNi41MzY0NTgsLTQ2LjMwMjA4MyA1Mi45MTY2NjYxLC04MS41Nzg5NzkgOTguMTE1NDM2LC05OC4xMTU0MzcgNC40MTA2MDQsLTIuMjAzOTc5IDYuNjE0NTg0LC01LjUxMTI3MSA2LjYxNDU4NCwtMTEuMDI1MTg3IHYgLTE1LjQzMzE0NiBjIDAsLTQuNDEwNjA0IC0yLjIwMzk4LC03LjcxNzg5NSAtNi42MTQ1ODQsLTguODE4NTYyIC0xLjEwMzMxMiwwIC0zLjMwNzI5MSwwIC00LjQxMDYwNCwxLjEwMDY2NyBDIC02Ni44NTEwNzEsLTY0LjU3NjU2NyAtMTI0LjE3ODM0LDQ2Ljc3MDY4MSAtOTEuMTA1NDI1LDE1MS41MDA3IGMgMTkuODQzNzUsNjEuNzM1MjMgNjcuMjQ5MTQ1LDEwOS4xNDA2MiAxMjguOTg0MzczLDEyOC45ODQzNyA0LjQxMDYwNCwyLjIwMzk4IDguODIxMjA4LDAgOS45MjE4NzUsLTQuNDEwNiAxLjEwMzMxMywtMS4xMDA2NyAxLjEwMzMxMywtMi4yMDM5OCAxLjEwMzMxMywtNC40MDc5NiB2IC0xNS40MzU3OSBjIDAsLTMuMzA3MjkgLTMuMzA3MjkyLC03LjcxNTI1IC02LjYxNDU4NCwtOS45MjE4NyB6IE0gMTU5LjE0ODA3LC05Ny42NDk0ODMgYyAtNC40MTA2LC0yLjIwMzk4IC04LjgyMTIxLDAgLTkuOTIxODcsNC40MTA2MDQgLTEuMTAzMzIsMS4xMDMzMTIgLTEuMTAzMzIsMi4yMDM5NzkgLTEuMTAzMzIsNC40MTA2MDQgdiAxNS40MzMxNDUgYyAwLDQuNDEwNjA0IDMuMzA3Myw4LjgxODU2MyA2LjYxNDU5LDExLjAyNTE4OCA4NS45ODk1OCwzMC44NjYyOTEgMTMwLjA4NzY4LDEyNi43Nzc3NDggOTguMTE1NDMsMjExLjY2NjY2MiAtMTYuNTM2NDUsNDYuMzAyMDggLTUyLjkxNjY2LDgxLjU3ODk4IC05OC4xMTU0Myw5OC4xMTU0NCAtNC40MTA2MSwyLjIwMzk4IC02LjYxNDU5LDUuNTExMjcgLTYuNjE0NTksMTEuMDI1MTkgdiAxNS40MzMxNCBjIDAsNC40MTA2MSAyLjIwMzk4LDcuNzE3OSA2LjYxNDU5LDguODE4NTYgMS4xMDMzMSwwIDMuMzA3MjksMCA0LjQxMDYsLTEuMTAwNjYgQyAyNjMuODc4MDksMjQ4LjUxNTQ3IDMyMS4yMDUzNiwxMzcuMTY4MjIgMjg4LjEzMjQ1LDMyLjQzODIwMiAyNjguMjg4NywtMzAuNDAwMzM5IDIxOS43Nzk5OSwtNzcuODA1NzM0IDE1OS4xNDgwNywtOTcuNjQ5NDgzIFoiCiAgICAgICBmaWxsPSIjZmZmIgogICAgICAgaWQ9InBhdGg2IgogICAgICAgc3R5bGU9ImZpbGw6IzFmYWU0YTtmaWxsLW9wYWNpdHk6MTtzdHJva2Utd2lkdGg6MC4yNjQ1ODMiIC8+CiAgPC9nPgo8L3N2Zz4K'

    try {
      // wasAdded is a boolean. Like any RPC method, an error may be thrown.
      const wasAdded = await this.injectedProvider.send('wallet_watchAsset', {
        type: 'ERC20', // Initially only supports ERC20, but eventually more!
        options: {
          address: tokenAddress, // The address that the token is at.
          symbol: tokenSymbol, // A ticker symbol or shorthand, up to 5 chars.
          decimals: tokenDecimals, // The number of decimals in the token
          image: tokenImage // A string url of the token logo
        }
      } as any)

      if (wasAdded) {
        console.log('Thanks for your interest!')
      } else {
        console.log('Your loss!')
      }
    } catch (error) {
      console.log(error)
    }
  }
}
</script>

<!-- <style scoped> -->
<style>
h3 {
  margin: 40px 0 0;
}
ul {
  list-style-type: none;
  padding: 0;
}
li {
  display: inline-block;
  margin: 0 10px;
}
a {
  color: #42b983;
}
table {
  font-family: monospace;
  /* font-size: xx-large; */
  text-align: left;
}
.info th::after {
  content: ":";
}

table#virtual-floors {
  border-spacing: 5px;
  border-collapse: separate;
}

#virtual-floors td,
#virtual-floors th {
  background-color: #f7f7f7;
  padding: 10px;
}

#virtual-floors th {
  text-align: center;
}

#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
  margin-top: 60px;
}

.admin {
  background-color: red !important;
}
</style>
