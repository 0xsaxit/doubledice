<template>
  <section>
    <!-- <h2>New VPF</h2> -->
    <table>
      <tr>
        <th>Beta</th>
        <td>
          <input v-model.number="betaGradient" type="number" />
        </td>
      </tr>
      <tr>
        <th>Closure</th>
        <td>
          <input v-model="tClose" type="datetime-local" />
        </td>
      </tr>
      <tr>
        <th>Resolution</th>
        <td>
          <input v-model="tResolve" type="datetime-local" />
        </td>
      </tr>
      <tr>
        <th>Outcomes</th>
        <td>
          <input v-model.number="nOutcomes" type="number" />
        </td>
      </tr>
    </table>
    <div>
      <button @click="createVpf">Create VPF</button>
    </div>

    <pre>{{ json }}</pre>
  </section>
</template>

<script lang="ts">
import { EthereumProvider, EthereumProviderHelper } from '@/mm'
import { ethers } from 'ethers'
import { Vue } from 'vue-class-component'
// eslint-disable-next-line camelcase
import { DoubleDice, DoubleDice__factory } from '../../../doubledice-platform/typechain-types'

const MAIN_CONTRACT_ADDRESS = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512'

export default class Vpf extends Vue {
  contract!: DoubleDice

  betaGradient = 1

  tClose = '2022-01-01T00:00:00'

  tResolve = '2022-01-02T00:00:00'

  nOutcomes = 2

  async mounted(): Promise<void> {
    const ethereum = window.ethereum as EthereumProvider
    const eth = new EthereumProviderHelper(ethereum)
    await eth.init()
    const provider = new ethers.providers.Web3Provider(ethereum, 'any')
    const signer = provider.getSigner()
    this.contract = DoubleDice__factory.connect(MAIN_CONTRACT_ADDRESS, signer)
  }

  async createVpf(): Promise<void> {
    const vpfId = ethers.utils.randomBytes(32)
    const betaGradient = this.betaGradient
    const tClose = new Date(this.tClose).getTime() / 1000
    const tResolve = new Date(this.tResolve).getTime() / 1000
    const nOutcomes = this.nOutcomes
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const tx = await this.contract.createVirtualFloor(vpfId, betaGradient, tClose, tResolve, nOutcomes)
    const { hash } = tx
    const txUrl = `https://polygonscan.com/tx/${hash}`
    console.log(`Sent ${txUrl}`)
    await tx.wait()
    console.log(`⛏ Mined ${txUrl}`)
  }

  get json(): string {
    return JSON.stringify({
      betaGradient: this.betaGradient,
      tClose: this.tClose,
      tResolve: this.tResolve,
      nOutcomes: this.nOutcomes
    }, null, 2)
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

pre,
table {
  font-family: monospace;
  /* font-size: large; */
  text-align: left;
}
th::after {
  content: ":";
}
</style>
