import detectEthereumProvider from '@metamask/detect-provider'
import { createApp } from 'vue'
import App from './App.vue'

async function main() {
  const provider = await detectEthereumProvider()

  if (provider) {
    // From now on, this should always be true:
    // provider === window.ethereum
    createApp(App).mount('#app')
  } else {
    alert('🦊 Please install MetaMask! 🦊')
  }
}

main()
