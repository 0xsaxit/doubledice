<template>
  <tbody class="virtual-floor">
    <tr :id="`virtual-floor-${virtualFloor.id}`">
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
        <div>
          <h2>
            {{ virtualFloor.title }}
            <span style="float: right">
              <span class="label">{{ virtualFloor.subcategory.category.slug }}</span>
              <span class="label">{{ virtualFloor.subcategory.slug }}</span>
            </span>
          </h2>
          <p>{{ virtualFloor.description }}</p>
          <div>
            <template v-for="(opponent, index) in virtualFloor.opponents" :key="opponent.id">
              <div
                style="display: inline-block; font-size: xx-large; font-style: italic; padding: 30px"
                v-if="index > 0"
              >
                <span>VS</span>
              </div>
              <div style="display: inline-block">
                <div>
                  <img style="height: 64px" :src="opponent.image" :title="opponent.title" />
                </div>
                <div>{{ opponent.title }}</div>
              </div>
            </template>
          </div>
        </div>
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
import { DoubleDice as DoubleDiceContract } from '@doubledice/platform/lib/contracts'
import { VirtualFloor as VirtualFloorEntity } from '@doubledice/platform/lib/graph'
import { PropType } from 'vue'
import { Options, Vue } from 'vue-class-component'
import { formatTimestamp } from '../utils'
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

.label {
  background: lightsteelblue;
  padding: 4px;
  margin: 4px;
  border-radius: 10px;
}
</style>
