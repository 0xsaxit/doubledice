## Setting up

```sh
sudo service postgresql stop # just in case
nvm use # see https://github.com/nvm-sh/nvm
cd platform
npm install
cp .env.local .env
```

To run tests:
```
npm test
```

Run `npm start` to:
1. Start local ganache-cli
2. Start local IPFS node
3. Start local Graph node
4. Deploy contracts
5. Deploy the subgraph

After this it will be possible to:
1. Create a test-VirtualFloor programmatically by running `npm run test:local:create-vf`
2. [Query the graph using GraphQL](http://127.0.0.1:8000/subgraphs/name/doubledice-com/doubledice-platform/graphql)

Then to run the app:

```sh
cd ../app
npm install
npm run generate
npm run serve
```

To stop all services run `npm stop` and wait for all containers to be halted.

## MetaMask setup

Import hardhat seed phrase:

```
test test test test test test test test test test test junk
```

Connect to network on http://localhost:8545

[Reset MetaMask account](chrome-extension://nkbihfbeogaeaoehlefnkodbefgpgknn/home.html#settings/advanced) every time after restarting local network.
