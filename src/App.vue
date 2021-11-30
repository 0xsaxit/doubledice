<template>
  <img style="height: 100px" alt="DoubleDice 🎲🎲" src="./assets/logo.png" />
  <HelloWorld msg="DoubleDice 🎲🎲" />
  <Vpf />
</template>

<script lang="ts">
import { Options, Vue } from 'vue-class-component'
import HelloWorld from './components/HelloWorld.vue'
import Vpf from './components/Vpf.vue'

@Options({
  components: {
    HelloWorld,
    Vpf
  }
})
export default class App extends Vue { }
</script>

<style>
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
  margin-top: 60px;
}
</style>
