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
        <th>betaOpen</th>
        <td>
          <input v-model.number="betaOpen" type="number" />
        </td>
      </tr>
      <tr>
        <th>tOpen</th>
        <td>
          <input v-model="tOpen" type="datetime-local" />
        </td>
      </tr>
      <tr>
        <th>tClose</th>
        <td>
          <input v-model="tClose" type="datetime-local" />
        </td>
      </tr>
      <tr>
        <th>tResolve</th>
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
    paymentTokens: Object as PropType<PaymentTokenEntity[]>,
    nextBlockTimestamp: Number
  }
})
export default class NewVirtualFloor extends Vue {
  contract!: DoubleDiceContract

  paymentTokens!: PaymentTokenEntity[]

  nextBlockTimestamp!: number

  // nullable because otherwise property won't be picked up during setup; ToDo: Find a better way
  selectedPaymentToken: PaymentTokenEntity | null = null

  betaOpen = 10

  tOpen!: string

  tClose!: string

  tResolve!: string

  nOutcomes = 2

  async created(): Promise<void> {
    const tOpen = this.nextBlockTimestamp - (this.nextBlockTimestamp % 60)
    this.selectedPaymentToken = this.paymentTokens[0]
    this.tOpen = new Date((tOpen + 0 * 24 * 60 * 60) * 1000).toISOString().slice(0, 19) // in 0 week's time
    this.tClose = new Date((tOpen + 7 * 24 * 60 * 60) * 1000).toISOString().slice(0, 19) // in 1 week's time
    this.tResolve = new Date((tOpen + 14 * 24 * 60 * 60) * 1000).toISOString().slice(0, 19) // in 2 weeks' time
  }

  async createVpf(): Promise<void> {
    // Generate a virtualFloorId in the hex form 00_0000000000000000000000000000000000000000000000_XXXXXXXXXXXXXXXX
    // - First byte = 0x00, meaning "virtualfloor token type"
    // - Next 23 bytes are all 0x00 to save intrinsic-gas on all future calls that will reference this virtualfloor-id
    // - Lower 8 bytes are actually used for virtualFloorId
    const virtualFloorId = ethers.utils.randomBytes(8)

    const betaOpen = EthersBigNumber.from(10).pow(12).mul(this.betaOpen * 1_000000)
    let tOpen = new Date(this.tOpen).getTime() / 1000
    let tClose = new Date(this.tClose).getTime() / 1000
    let tResolve = new Date(this.tResolve).getTime() / 1000
    tOpen = tOpen - (tOpen % 60)
    tClose = tClose - (tClose % 60)
    tResolve = tResolve - (tResolve % 60)
    const nOutcomes = this.nOutcomes
    const { address: paymentToken } = this.selectedPaymentToken as PaymentTokenEntity

    // eslint-disable-next-line space-before-function-paren
    tryCatch(async () => {
      const tx = await this.contract.createVirtualFloor(virtualFloorId, betaOpen, tOpen, tClose, tResolve, nOutcomes, paymentToken)
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
