const path = require('path')
const webpack = require('webpack')

module.exports = {
  resolve: {
    fallback: {
      'assert': require.resolve('assert/')
    }
  },
}
