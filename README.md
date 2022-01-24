# Setting up

```sh
sudo service postgresql stop # just in case
nvm use # see https://github.com/nvm-sh/nvm
npm install
npx lerna bootstrap
```

Then:

```
cd platform
cp .env.local .env
npm test
npm start
```

Running `npm start` will:
1. Start local ganache-cli
2. Start local IPFS node
3. Start local Graph node
4. Deploy contracts
5. Deploy the subgraph

After this it will be possible to:
1. Create a test-VirtualFloor programmatically by running `npm run test:local:create-vf`
2. [Query the graph using GraphQL](http://127.0.0.1:8000/subgraphs/name/doubledice-com/doubledice-platform/graphql)


Finally run the reference-app:

```sh
cd ../app
npm run serve
```

To stop all services run `npm stop` from within `./platform` and wait for all containers to be halted.

# Installing @doubledice/platform as a library

Always import from:
- `@doubledice/platform/lib/contracts`: TypeScript bindings for the contracts
- `@doubledice/platform/lib/graph`: TypeScript bindings for the Graph entities

# 🚫 `npm install`

To add a package, do not `npm install` it into the subproject-specific directory. Instead, to install e.g. `rimraf` into `platform` subproject, from the top-level:

```sh
npx lerna add rimraf platform
```

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

Initially, the way in which non-essential data was being piped to the Graph was that when the user enters the data, the data was validated via a call to the validation-server, which then also uploaded to IPFS, and what was sent to `createVirtualFloor` was the IPFS content hash `metadataHash`. That hash was then emitted on the `VirtualFloorCreation` event and picked up by the Graph indexer, which then retrieved the (valid) data from IPFS and inserted it into the index along with the rest of the essential data. Once the data has been indexed, it was then possible to query it from the frontend.

However this implementation has been replaced with a more straightforward implementation by which the metadata is passed directly to the `createVirtualFloor` function directly through the `metadata` struct parameter. The `createVirtualFloor` function does not save that metadata on chain, but simply emits the entire structure untouched on the `VirtualFloorCreation` event, which is then picked up by the Graph indexer and handled as described above. The reasons for abandoning the previous implementation are:
1. Primarily, to avoid needing to have a centralized server and having to manage operational private keys, HSM, etc.
2. Avoiding the IPFS step results in a system with less moving parts and that is less likely to break.
3. The room-creation process becomes simpler because the frontend need only make a single `createVirtualFloor` call to the contract, which either succeeds or fails.

Prior to this architectural change, `createVirtualFloor` consumed ~80000 gas. After this change, it consumes ~115000. A 35000 gas increase isn’t too bad, when one considers the benefits. (However, the on-chain validation is not 100% complete. See note in [_requireValidMetadata](./platform/contracts/VirtualFloorMetadata.sol)) The extra gas is probably being wasted:
1. as extra intrinsic gas to pay for the extra bytes being passed to the function
2. as extra gas to emit the data on the `VirtualFloorCreation` event. The second gas-usage could potentially be eliminated by exploiting the fact that the metadata is already available as an argument to the `createVirtualFloor` function, and refactoring the `handleVirtualFloorCeation` handler to be a [CallHandler](https://thegraph.com/docs/en/developer/create-subgraph-hosted/#defining-a-call-handler) instead of an EventHandler. By doing this, it would be no longer necessary to re-emit the data on the event. But right now (Docker image `trufflesuite/ganache-cli:v6.12.2`) this cannot be implemented the underlying Ganache blockchain throws error `Method trace_filter not supported.`.
3. to validate the metadata in [_requireValidMetadata](./platform/contracts/VirtualFloorMetadata.sol). This could potentially be omitted, as explained in the comment in the function.

# Upgrading dependencies

Always exercise caution when upgrading dependencies, especially with packages like `@openzeppelin/contracts` which have a direct impact on the code itself. But for the bulk-upgrade of dev-tools, you may choose to apply the methodology below.

First of all, ensure you are using the correct node version:

```sh
nvm use
```

Starting from the top-level package, in each package, first run:

```sh
npm-check-updates
```

to check which packages will upgrade to which version. If this tool is missing, first `npm install --global npm-check-updates`.

If you are pleased with the majority of suggested upgrades, then `npm check-updates --upgrade`. This will upgrade the versions in `package.json`, but will not yet install the upgraded packages.

`npm-check-updates` will always suggest the latest release, so if there are any packages that you specifically want to _not_ upgrade, for several possible reasons:
- it suggests to upgrade `@openzeppelin/contracts` but you do not want to make this upgrade as yet as you have audited the contracts with a specific package version,
- or upgrading a particular package introduces a bug, so you want to postpone the upgrade until a fix is released
then revert the corresponding individual `package.json` changes. If any upgrade is ommitted on purpose, try and make this decision clear in a comment and/or the log-commit,
- or it suggests to upgrade `@types/node` from `16` to `17`, but you want to keep it at `16` to match the installed NodeJS version.

At this point you would normally `npm install` to perform the upgrade, but since we are using `lerna`, instead in in the top-level project run:

```sh
npx lerna boostrap
```

This should install the new packages, and update the corresponding `package-lock.json`.

Repeat for all projects, testing after each step.

You can choose commit all changes either in one big step, or on a project-by-project basis, or sometimes even on a package-by-package basis, depending on how likely it is that you will need to revert the upgrade.
