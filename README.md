# Setting up

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

## Creating an room/virtual-floor

:information_source: For now it is called a _room_ in the FE, and a _virtual floor_ (VF) in most of the code. At some point these 2 terms will be merged.

The data inputted by the user in the front-end (FE) is classified into _essential_ and _non-essential_:

- _Essential_ data is the minimal set of data required by the smart-contract to be able to manage the life-cycle of a VF, and this data is stored on-chain.
- _Non-essential_ data e.g. event title, opponent title, etc. is intended for human consumption in the user-interface (UI), but is not required to be stored on-chain. Nevertheless, we “pipe” this data through the contract when a virtual-floor is created, for the following reasons:
  1. We want to maintain the Graph as the single source of truth about our system. Since the Graph takes its input from EVM events emitted by the DD contract, we can expose the non-essential data to the Graph indexer by emitting it on the `VirtualFloorCreation` event along with the essential data. _How_ this is achieved is explained further on.
  2. The `createVirtualFloor` contract is final. The essential data is validated by the smart-contract, but we need the non-essential data to be validated as well. We do not want to be managing the validation of non-essential data on-chain, as this will be dynamic (e.g. the list of categories and subcategories). Therefore the DD validator validates the data off-chain and stamps it with a signature, and the contract simply verifies that signature.

Currently the way in which non-essential data is piped to the Graph is that when the user enters the data, once the data is validated it is uploaded to IPFS, and what is sent to `createVirtualFloor` is the IPFS content hash `metadataHash`. That hash is then emitted on the `VirtualFloorCreation` event and picked up by the Graph indexer, which then retrieves the (valid) data from IPFS and inserts it into the index along with the rest of the essential data. Once the data has been indexed, it is available for the FE to query.

An alternative implementation, which might raise gas-costs slightly, but which would eliminate the IPFS step  (which might cause some headaches in the future), could be to pass the non-essential data in either (a) a Solidity struct, possibly abi-encoded, or (b) as a blob of JSON data, or (c) as a blob of minified JSON data, or (d) possibly using a binary format such as protobufs, maybe there is a tool to convert between JSON-schema and protobuf schema. To save some gas, instead of emitting this on an event, this data could be processed directly via a [CallHandler](https://thegraph.com/docs/en/developer/create-subgraph-hosted/#defining-a-call-handler). But this is an implementation detail — at the higher level, the rest of the system would remain the same.

