<template>
  <tbody class="virtual-floor">
    <tr>
      <td :colspan="7 + maxOutcomes">
        <Timeline
          :min="minVirtualFloorTimestamp"
          :start="Number(virtualFloor.tCreated)"
          :open="Number(virtualFloor.tOpen)"
          :close="Number(virtualFloor.tClose)"
          :resolve="Number((virtualFloor.tResolve))"
          :max="maxVirtualFloorTimestamp"
          :locked="fastforwarding"
          :now="nextBlockTimestamp"
        />
      </td>
    </tr>
    <tr>
      <!--
        <td>
          <pre style="font-size: xx-small">{{ JSON.stringify(virtualFloor, null, 2) }}</pre>
        </td>
      -->
      <td>{{ virtualFloor.id.slice(0, 10) }}</td>
      <td>
        <table>
          <tr :title="`tCreated = ${virtualFloor.tCreated}`">
            <th>tCreated</th>
            <td>{{ formatTimestamp(tCreated) }}</td>
          </tr>
          <tr :title="`tOpen = ${virtualFloor.tOpen}`">
            <th>tOpen</th>
            <td>{{ formatTimestamp(tOpen) }}</td>
          </tr>
          <tr :title="`tClose = ${virtualFloor.tClose}`">
            <th>tClose</th>
            <td>{{ formatTimestamp(tClose) }}</td>
          </tr>
          <tr :title="`tResolve = ${virtualFloor.tResolve}`">
            <th>tResolve</th>
            <td>{{ formatTimestamp(tResolve) }}</td>
          </tr>
        </table>
      </td>
      <td>{{ virtualFloor.state }}</td>
      <td>{{ virtualFloor.paymentToken.symbol }}/{{ virtualFloor.paymentToken.decimals }}</td>
      <td>{{ virtualFloor.owner.id.slice(0, 10) }}{{ isOwnedByConnectedAccount ? ' (you)' : '' }}</td>
      <td>{{ beta.toFixed(6) }}</td>
      <td>{{ virtualFloor.totalSupply }}</td>
      <template v-for="outcome in virtualFloor.outcomes" :key="outcome.id">
        <Outcome
          :contract="contract"
          :virtualFloor="virtualFloor"
          :outcome="outcome"
          :nextBlockTimestamp="nextBlockTimestamp"
          @balanceChange="$emit('balanceChange')"
        />
      </template>
    </tr>
  </tbody>
</template>

<script lang="ts">
import { formatTimestamp } from '@/utils'
import { PropType } from 'vue'
import { Options, Vue } from 'vue-class-component'
import { DoubleDice as DoubleDiceContract } from '../../../platform/typechain-types'
import { VirtualFloor as VirtualFloorEntity } from '../generated/graphql'
import Outcome from './OutcomeComponent.vue'
import Timeline from './Timeline.vue'

@Options({
  props: {
    contract: Object as PropType<DoubleDiceContract>,
    virtualFloor: Object as PropType<VirtualFloorEntity>,
    connectedAccountAddress: String,
    minVirtualFloorTimestamp: Number,
    maxVirtualFloorTimestamp: Number,
    maxOutcomes: Number,
    fastforwarding: Boolean,
    nextBlockTimestamp: Number
  },
  components: {
    Timeline,
    Outcome
  },

  emits: {
    balanceChange: String // null?
  }
})
export default class VirtualFloorComponent extends Vue {
  contract!: DoubleDiceContract
  virtualFloor!: VirtualFloorEntity
  connectedAccountAddress!: string
  minVirtualFloorTimestamp!: number
  maxVirtualFloorTimestamp!: number
  maxOutcomes!: number
  fastforwarding!: boolean
  nextBlockTimestamp!: number

  get tCreated(): number {
    return Number(this.virtualFloor.tCreated)
  }

  get tOpen(): number {
    return Number(this.virtualFloor.tOpen)
  }

  get tClose(): number {
    return Number(this.virtualFloor.tClose)
  }

  get tResolve(): number {
    return Number(this.virtualFloor.tResolve)
  }

  get isOwnedByConnectedAccount(): boolean {
    return this.virtualFloor.owner.id === this.connectedAccountAddress?.toLowerCase()
  }

  get beta(): number {
    const t = Math.max(this.tOpen, Math.min(this.nextBlockTimestamp, this.tClose))
    return 1 + ((this.tClose - t) * (Number(this.virtualFloor.betaOpen) - 1)) / (this.tClose - this.tOpen)
  }

  formatTimestamp(timestamp: string | number): string {
    return formatTimestamp(timestamp)
  }
}
</script>

<style scoped>
tbody.virtual-floor {
  outline: 1px dashed black;
}
</style>
