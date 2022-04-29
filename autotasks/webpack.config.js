const path = require('path');
const webpack = require('webpack');

module.exports = {
  entry: {
    vfbot: './src/vfbot.ts',
    'vf-creation-notifier': './src/vf-creation-notifier.ts',
  },
  target: 'node',
  mode: 'development',
  devtool: 'cheap-module-source-map',
  module: {
    rules: [
      { test: /\.tsx?$/, use: 'ts-loader', exclude: /node_modules/ },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  externals: [
    // List here all dependencies available on the Autotask environment
    /axios/,
    /apollo-client/,
    /defender-[^\-]+-client/,
    /ethers/,
    /web3/,
    /@ethersproject\/.*/,
    /aws-sdk/,
    /aws-sdk\/.*/,
  ],
  externalsType: 'commonjs2',
  plugins: [
    // Read DD_ENV from current compile-time env, and replace process.env.DD_ENV with this value (stringified) in built code
    new webpack.EnvironmentPlugin(['DD_ENV']),

    // List here all dependencies that are not run in the Autotask environment
    new webpack.IgnorePlugin({ resourceRegExp: /dotenv/ }),
  ],
  output: {
    filename: '[name]/index.js',
    path: path.resolve(__dirname, 'dist'),
    library: { type: 'commonjs2' }
  },
};
