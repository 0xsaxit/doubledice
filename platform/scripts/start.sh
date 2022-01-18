#!/bin/sh

set -e

docker-compose up &

while ! nc -z localhost 8545; do   
  echo "Waiting for localhost:8545..."
  sleep 0.5
done

npm run contracts:deploy:local

npm run graph:all:local

docker exec platform_ipfs_1 ipfs config --json API.HTTPHeaders.Access-Control-Allow-Origin  '["http://localhost:8080"]'
docker exec platform_ipfs_1 ipfs config --json API.HTTPHeaders.Access-Control-Allow-Methods '["PUT", "POST", "GET"]'
docker restart platform_ipfs_1
