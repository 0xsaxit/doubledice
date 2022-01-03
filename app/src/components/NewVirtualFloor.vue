<template>
  <section>
    <h2>New VPF</h2>
    <table>
      <tr>
        <th>betaGradient</th>
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
    <!-- <pre>{{ json }}</pre> -->
  </section>
</template>

<script lang="ts">
import { BigNumber as EthersBigNumber, ethers } from 'ethers'
import { PropType } from 'vue'
import { Options, Vue } from 'vue-class-component'
// eslint-disable-next-line camelcase
import { DoubleDice as DoubleDiceContract } from '../../../platform/typechain-types'
import { tryCatch } from '../utils'

const MAIN_CONTRACT_ADDRESS = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512'

@Options({
  props: {
    contract: Object as PropType<DoubleDiceContract>
  }
})
export default class NewVirtualFloor extends Vue {
  contract!: DoubleDiceContract

  betaGradient = 1

  // in 1 week's time
  tClose = new Date(new Date().getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 19)

  // in 2 weeks' time
  tResolve = new Date(new Date().getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 19)

  nOutcomes = 2

  async createVpf(): Promise<void> {
    const vpfId = ethers.utils.randomBytes(32)
    const betaGradient = this.betaGradient
    const tClose = new Date(this.tClose).getTime() / 1000
    const tResolve = new Date(this.tResolve).getTime() / 1000
    const nOutcomes = this.nOutcomes

    // eslint-disable-next-line space-before-function-paren
    tryCatch(async () => {
      const tx = await this.contract.createVirtualFloor(vpfId, EthersBigNumber.from(10).pow(18).mul(betaGradient), tClose, tResolve, nOutcomes)
      const { hash } = tx
      const txUrl = `https://polygonscan.com/tx/${hash}`
      console.log(`Sent ${txUrl}`)
      await tx.wait()
      console.log(`⛏ Mined ${txUrl}`)
    })
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
