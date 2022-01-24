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
        <th>Title</th>
        <td>
          <input v-model="title" type="text" placeholder="Enter title" size="40" />
        </td>
      </tr>
      <tr>
        <th>Description</th>
        <td>
          <textarea v-model="description" placeholder="Enter description" cols="80" />
        </td>
      </tr>
      <tr>
        <th>Listed</th>
        <td>
          <input type="radio" v-model="visibility" id="choice-public" value="public" />
          <label for="choice-public">Public</label>
          <input type="radio" v-model="visibility" id="choice-unlisted" value="unlisted" />
          <label for="choice-unlisted">Unlisted</label>
        </td>
      </tr>
      <tr>
        <th>Category</th>
        <td>
          <select v-model="category">
            <option value="sports">Sports</option>
            <option value="other">Other</option>
          </select>
        </td>
      </tr>
      <tr>
        <th>Subcategory</th>
        <td>
          <select v-model="subcategory">
            <option value="football">Football</option>
            <option value="other">Other</option>
          </select>
        </td>
      </tr>
      <tr>
        <th>Opponents</th>
        <td>
          <NewOpponentsComponent v-model="opponents" />
        </td>
      </tr>
      <tr>
        <th>nOutcomes</th>
        <td>
          <input v-model.number="nOutcomes" type="number" readonly disabled />
        </td>
      </tr>
      <tr>
        <th>Outcomes</th>
        <td>
          <NewOutcomesComponent v-model="outcomes" />
        </td>
      </tr>
      <tr>
        <th>Result sources</th>
        <td>
          <NewResultSourcesComponent v-model="resultSources" />
        </td>
      </tr>
    </table>
    <div>
      <button @click="createVpf">Create VPF</button>
    </div>
  </section>
</template>

<script lang="ts">
import {
  DoubleDice as DoubleDiceContract,
  RoomEventInfo,
  VirtualFloorCreationParamsStruct
} from '@doubledice/platform/lib/contracts'
import { PaymentToken as PaymentTokenEntity } from '@doubledice/platform/lib/graph'
import { validateRoomEventInfo } from '@doubledice/platform/lib/metadata'
import { BigNumber as EthersBigNumber, ethers } from 'ethers'
import { PropType } from 'vue'
import { Options, Vue } from 'vue-class-component'
import { tryCatch } from '../utils'
import NewOpponentsComponent from './NewOpponentsComponent.vue'
import NewOutcomesComponent from './NewOutcomesComponent.vue'
import NewResultSourcesComponent from './NewResultSourcesComponent.vue'

// See https://class-component.vuejs.org/guide/class-component.html#data
// > Note that if the initial value is undefined,
// > the class property will not be reactive which means the changes for the properties
// > will not be detected
const NOT_UNDEFINED_STRING = ''

@Options({
  props: {
    contract: Object as PropType<DoubleDiceContract>,
    paymentTokens: Object as PropType<PaymentTokenEntity[]>,
    nextBlockTimestamp: Number
  },
  components: {
    NewOpponentsComponent,
    NewOutcomesComponent,
    NewResultSourcesComponent
  }
})
export default class NewVirtualFloor extends Vue {
  contract!: DoubleDiceContract

  paymentTokens!: PaymentTokenEntity[]

  nextBlockTimestamp!: number

  // nullable because otherwise property won't be picked up during setup; ToDo: Find a better way
  selectedPaymentToken: PaymentTokenEntity | null = null

  betaOpen = 10

  tOpen = NOT_UNDEFINED_STRING

  tClose = NOT_UNDEFINED_STRING

  tResolve = NOT_UNDEFINED_STRING

  _title: RoomEventInfo['title'] = NOT_UNDEFINED_STRING

  set title(value: string) {
    this._title = value
  }

  get title(): string {
    return this._title || this.opponents.map(({ title }) => title).join(' vs ')
  }

  _description: RoomEventInfo['description'] = NOT_UNDEFINED_STRING

  set description(value: string) {
    this._description = value
  }

  get description(): string {
    const opponentNames = this.opponents.map(({ title }) => title)
    const opponents = opponentNames.length >= 2 ? opponentNames.join(' & ') : ''
    const date = new Date(this.tResolve).toDateString()
    return this._description || (opponents ? `Match on ${date} between ${opponents}` : '')
  }

  visibility: 'public' | 'unlisted' = 'public'

  get isListed(): boolean {
    return this.visibility === 'public'
  }

  category: RoomEventInfo['category'] = 'sports'

  subcategory: RoomEventInfo['subcategory'] = 'football'

  get nOutcomes(): number {
    return this.outcomes.length
  }

  opponents: RoomEventInfo['opponents'] = []

  outcomes: RoomEventInfo['outcomes'] = []

  resultSources: RoomEventInfo['resultSources'] = []

  async created(): Promise<void> {
    const tOpen = this.nextBlockTimestamp - (this.nextBlockTimestamp % 60)
    this.selectedPaymentToken = this.paymentTokens[0]
    this.tOpen = new Date((tOpen + 0 * 24 * 60 * 60) * 1000).toISOString().slice(0, 19) // in 0 week's time
    this.tClose = new Date((tOpen + 7 * 24 * 60 * 60) * 1000).toISOString().slice(0, 19) // in 1 week's time
    this.tResolve = new Date((tOpen + 14 * 24 * 60 * 60) * 1000).toISOString().slice(0, 19) // in 2 weeks' time
  }

  async createVpf(): Promise<void> {
    const metadata: RoomEventInfo = {
      title: this.title,
      description: this.description,
      isListed: this.isListed,
      category: this.category,
      subcategory: this.subcategory,
      opponents: this.opponents,
      outcomes: this.outcomes,
      resultSources: this.resultSources
    }

    if (!validateRoomEventInfo(metadata)) {
      console.error(validateRoomEventInfo.errors)
      alert(JSON.stringify(validateRoomEventInfo.errors))
      return
    }

    // Generate a virtualFloorId in the hex form 00_0000000000000000000000000000000000000000000000_XXXXXXXXXXXXXXXX
    // - First byte = 0x00, meaning "virtualfloor token type"
    // - Next 23 bytes are all 0x00 to save intrinsic-gas on all future calls that will reference this virtualfloor-id
    // - Lower 8 bytes are actually used for virtualFloorId
    const virtualFloorId = ethers.utils.randomBytes(8)

    // eslint-disable-next-line camelcase
    const betaOpen_e18 = EthersBigNumber.from(10).pow(12).mul(this.betaOpen * 1_000000)
    let tOpen = new Date(this.tOpen).getTime() / 1000
    let tClose = new Date(this.tClose).getTime() / 1000
    let tResolve = new Date(this.tResolve).getTime() / 1000
    tOpen = tOpen - (tOpen % 60)
    tClose = tClose - (tClose % 60)
    tResolve = tResolve - (tResolve % 60)
    const nOutcomes = this.nOutcomes
    const { address: paymentToken } = this.selectedPaymentToken as PaymentTokenEntity

    const params: VirtualFloorCreationParamsStruct = {
      virtualFloorId,
      betaOpen_e18,
      tOpen,
      tClose,
      tResolve,
      nOutcomes,
      paymentToken,
      metadata
    }
    // eslint-disable-next-line space-before-function-paren
    tryCatch(async () => {
      const tx = await this.contract.createVirtualFloor(params)
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
