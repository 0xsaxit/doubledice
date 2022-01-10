<template>
  <section>
    <h2>New VPF</h2>
    <table>
      <tr>
        <th>Payment token</th>
        <td>
          <select v-model="selectedPaymentToken">
            <option
              v-for="paymentToken in paymentTokens"
              :value="paymentToken"
              :key="paymentToken.id"
            >{{ paymentToken.name }}</option>
          </select>
        </td>
      </tr>
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
  </section>
</template>

<script lang="ts">
import { BigNumber as EthersBigNumber, ethers } from 'ethers'
import { PropType } from 'vue'
import { Options, Vue } from 'vue-class-component'
// eslint-disable-next-line camelcase
import { DoubleDice as DoubleDiceContract } from '../../../platform/typechain-types'
import { PaymentToken as PaymentTokenEntity } from '../generated/graphql'
import { tryCatch } from '../utils'

@Options({
  props: {
    contract: Object as PropType<DoubleDiceContract>,
    paymentTokens: Object as PropType<PaymentTokenEntity[]>
  }
})
export default class NewVirtualFloor extends Vue {
  contract!: DoubleDiceContract

  paymentTokens!: PaymentTokenEntity[]

  // nullable because otherwise property won't be picked up during setup; ToDo: Find a better way
  selectedPaymentToken: PaymentTokenEntity | null = null

  betaGradient = 1

  // in 1 week's time
  tClose = new Date(new Date().getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 19)

  // in 2 weeks' time
  tResolve = new Date(new Date().getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 19)

  nOutcomes = 2

  async beforeCreate(): Promise<void> {
    // async beforeMount(): Promise<void> {
    console.log(`beforeCreate: this.paymentTokens = ${this.paymentTokens}`)
    this.selectedPaymentToken = this.paymentTokens[0]
  }

  async createVpf(): Promise<void> {
    const vpfId = ethers.utils.randomBytes(32)
    const betaGradient = EthersBigNumber.from(10).pow(18).mul(this.betaGradient)
    const tClose = new Date(this.tClose).getTime() / 1000
    const tResolve = new Date(this.tResolve).getTime() / 1000
    const nOutcomes = this.nOutcomes
    const { address: paymentToken } = this.selectedPaymentToken as PaymentTokenEntity

    // eslint-disable-next-line space-before-function-paren
    tryCatch(async () => {
      const tx = await this.contract.createVirtualFloor(vpfId, betaGradient, tClose, tResolve, nOutcomes, paymentToken)
      const { hash } = tx
      const txUrl = `https://polygonscan.com/tx/${hash}`
      console.log(`Sent ${txUrl}`)
      await tx.wait()
      console.log(`⛏ Mined ${txUrl}`)
    })
  }
}
</script>

<style scoped>
</style>
