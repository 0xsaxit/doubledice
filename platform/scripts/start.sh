#!/bin/sh

set -e

docker-compose up &

while ! nc -z localhost 8545; do   
  echo "Waiting for localhost:8545..."
  sleep 0.5
done

npm run contracts:deploy:local

npm run graph:all:local
