## Setting up

```sh
sudo service postgresql stop # just in case
cd platform
nvm use # see https://github.com/nvm-sh/nvm
npm install
npm start
cp .env.local .env
npm test
npm run contracts:deploy:local
npm run graph:all:local
```

After this it will be possible to:
1. Create a test-VirtualFloor programmatically by running `npm run test:local:create-vf`
2. [Query the graph using GraphQL](http://127.0.0.1:8000/subgraphs/name/doubledice-com/doubledice-platform/graphql)
3. `npm run build:sol-interface-for-remix` to generate `IDoubleDice` interface which can be loaded into Remix IDE to interact directly with contract deployed on running Ganache container

To shut down Docker properly, `docker-compose down`

## MetaMask setup

Import hardhat seed phrase:

```
test test test test test test test test test test test junk
```

Connect to network on http://localhost:8545

[Reset MetaMask account](chrome-extension://nkbihfbeogaeaoehlefnkodbefgpgknn/home.html#settings/advanced) every time after restarting local network.
