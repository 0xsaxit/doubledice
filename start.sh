#!/bin/sh

set -e

# Wait for Ganache to respond to a test-request, rather than simply waiting for port 8545 to be up
while ! curl -H "Content-Type: application/json" -X POST --data '{"id":0,"jsonrpc":"2.0","method":"web3_clientVersion","params":[]}' http://ganache-cli:8545; do
  echo "Waiting for Ganache on port 8545 to respond to a test-request..."
  sleep 0.5
done

cd platform

cp .env.docker .env

npm run contracts:deploy:docker

npm run graph:all:docker

cd ../app

npm run serve
