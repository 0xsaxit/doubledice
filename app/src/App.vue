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
      <td>{{ accountAddress }}</td>
    </tr>
    <tr>
      <th>
        Does connected account
        <br />own DD contract?
      </th>
      <td>{{ owner ? 'yes' : 'no' }}</td>
    </tr>
    <tr>
      <th>Fee beneficiary</th>
      <td>{{ feeBeneficiary }}</td>
    </tr>
    <tr>
      <th>Token</th>
      <td>{{ tokenDescription }}</td>
    </tr>
    <tr v-if="paymentTokens && contract && accountSigner">
      <th>Tokens</th>
      <td>
        <table>
          <PaymentTokenComponent
            v-for="paymentToken in paymentTokens"
            :key="paymentToken.id"
            :provider="injectedProvider"
            :paymentToken="paymentToken"
            :platformContractAddress="contract?.address"
            :accountSigner="accountSigner"
          ></PaymentTokenComponent>
        </table>
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
        <th>paymentToken</th>
        <th>owner</th>
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
      :connectedAccountAddress="accountAddress"
      :minVirtualFloorTimestamp="minVirtualFloorTimestamp"
      :maxVirtualFloorTimestamp="maxVirtualFloorTimestamp"
      :maxOutcomes="maxOutcomeCount.length"
      :fastforwarding="isFastforwarding"
      :nextBlockTimestamp="nextBlockTimestamp"
      @balanceChange="refreshBalances"
    />
  </table>

  <hr />

  <NewVirtualFloor
    v-if="contract && paymentTokens && nextBlockTimestamp"
    :contract="contract"
    :paymentTokens="paymentTokens"
    :nextBlockTimestamp="nextBlockTimestamp"
  />

  <hr />

  <div style="text-align: left">
    <a
      href="chrome-extension://nkbihfbeogaeaoehlefnkodbefgpgknn/home.html#settings/advanced"
      target="blank"
    >🦊🩹 Reset MetaMask account after restarting network</a>
  </div>
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
import NewVirtualFloor from './components/NewVirtualFloor.vue'
import PaymentTokenComponent from './components/PaymentTokenComponent.vue'
import VirtualFloorComponent from './components/VirtualFloorComponent.vue'
import {
  PaymentToken as PaymentTokenEntity,
  VirtualFloor as VirtualFloorEntity
} from './generated/graphql'

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
    paymentToken {
      symbol
      decimals
    }
    tClose
    tResolve
    state
    winningOutcome
    totalSupply
    betaGradient
    owner {
      id
    }
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
    NewVirtualFloor,
    PaymentTokenComponent
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
      pollInterval: 1 * 1000
    },
    paymentTokens: {
      query: gql`query {
        paymentTokens {
          id
          address
          name
          symbol
          decimals
        }
      }`,
      pollInterval: 60 * 1000
    }
  }
})
export default class App extends Vue {
  virtualFloors!: VirtualFloorEntity[]

  paymentTokens!: PaymentTokenEntity[]

  accountAddress!: string
  accountSigner!: providers.JsonRpcSigner

  owner?: boolean

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
    this.accountAddress = await signer.getAddress()
    this.accountSigner = signer

    const { name: networkName, chainId: networkChainId } = await this.injectedProvider.getNetwork()
    this.networkDescription = `${networkName}(🔗${networkChainId})`

    const mainContract = DoubleDice__factory.connect(MAIN_CONTRACT_ADDRESS, signer)

    this.contract = mainContract

    this.owner = await mainContract.hasRole(await mainContract.DEFAULT_ADMIN_ROLE(), this.accountAddress)

    this.feeBeneficiary = await mainContract.feeBeneficiary()

    const tokenAddress = '0x5FbDB2315678afecb367f032d93F642f64180aa3'

    const tokenContract = ERC20PresetMinterPauser__factory.connect(tokenAddress, signer)

    this.tokenContract = tokenContract

    const tokenName = await tokenContract.name()
    const tokenSymbol = await tokenContract.symbol()
    const tokenDecimals = await tokenContract.decimals()
    // this.tokenDescription = `${tokenName}(${tokenSymbol}, ${1 / (10 ** tokenDecimals)}) ${tokenContract.address}`
    this.tokenDescription = `${tokenName}(${tokenSymbol}, ${1 / (10 ** tokenDecimals)})`

    await this.refreshBalances()
    await this.refreshBalances()

    this.isMounted = true
  }

  async refreshBalances(): Promise<void> {
    console.log('Refreshing balances...')
    this.balance = new BigDecimal((await this.tokenContract.balanceOf(this.accountAddress!)).toString()).dividedBy(1_000000)
    this.allowance = new BigDecimal((await this.tokenContract.allowance(this.accountAddress!, this.contract.address)).toString()).dividedBy(1_000000)
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
