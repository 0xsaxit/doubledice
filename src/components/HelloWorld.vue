<template>
  <div class="hello">
    <h1>{{ msg }}</h1>
    <p>{{ counter }}</p>
    <table>
      <tr>
        <th>Network (🦊)</th>
        <td>{{ networkDescription }}</td>
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
        <td>{{ tokenDescription }}</td>
      </tr>
    </table>
  </div>
  <hr />
</template>

<script lang="ts">
import { EthereumProvider, EthereumProviderHelper } from '@/mm'
import { ethers } from 'ethers'
import { Options, Vue } from 'vue-class-component'
// eslint-disable-next-line camelcase
import { DoubleDice__factory, IERC20Metadata__factory } from '../../../doubledice-platform/typechain-types'

const MAIN_CONTRACT_ADDRESS = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512'

@Options({
  props: {
    msg: String
  }
})
export default class HelloWorld extends Vue {
  msg!: string

  counter = 0

  account?: string

  owner?: string

  networkDescription?: string

  tokenDescription?: string

  feeBeneficiary?: string

  beta?: number

  async mounted(): Promise<void> {
    console.log('Mounted 🐴')

    setInterval(() => {
      this.counter++
    }, 1000)

    const ethereum = window.ethereum as EthereumProvider

    const eth = new EthereumProviderHelper(ethereum)

    await eth.init()

    // We must specify the network as 'any' for ethers to allow network changes
    const provider = new ethers.providers.Web3Provider(ethereum, 'any')

    const signer = provider.getSigner()

    this.account = await signer.getAddress()

    const { name: networkName, chainId: networkChainId } = await provider.getNetwork()
    this.networkDescription = `${networkName} (🔗${networkChainId})`

    const mainContract = DoubleDice__factory.connect(MAIN_CONTRACT_ADDRESS, provider)

    this.owner = await mainContract.owner()

    this.feeBeneficiary = await mainContract._feeBeneficiary()

    const tokenAddress = await mainContract._token()

    const tokenContract = IERC20Metadata__factory.connect(tokenAddress, provider)

    const tokenName = await tokenContract.name()
    const tokenSymbol = await tokenContract.symbol()
    const tokenDecimals = await tokenContract.decimals()
    this.tokenDescription = `${tokenName} (${tokenSymbol}, ${1 / (10 ** tokenDecimals)})`
  }
}
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>
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
th::after {
  content: ":";
}
</style>
