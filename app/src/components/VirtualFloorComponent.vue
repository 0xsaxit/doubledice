<template>
  <tbody class="virtual-floor">
    <tr>
      <td :colspan="7 + maxOutcomes">
        <Timeline
          :min="minVirtualFloorTimestamp"
          :start="Number(virtualFloor.timestamp)"
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
      <td>{{ formatTimestamp(timestamp) }}</td>
      <td>{{ formatTimestamp(tClose) }}</td>
      <td>{{ formatTimestamp(tResolve) }}</td>
      <td>{{ virtualFloor.state }}</td>
      <td>{{ virtualFloor.paymentToken }}</td>
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
  minVirtualFloorTimestamp!: number
  maxVirtualFloorTimestamp!: number
  maxOutcomes!: number
  fastforwarding!: boolean
  nextBlockTimestamp!: number

  get timestamp(): number {
    return Number(this.virtualFloor.timestamp)
  }

  get tClose(): number {
    return Number(this.virtualFloor.tClose)
  }

  get tResolve(): number {
    return Number(this.virtualFloor.tResolve)
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
