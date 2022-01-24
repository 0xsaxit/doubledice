#!/bin/sh

set -e

if nc -z localhost 5432; then
  echo 'Cannot start if there is a service running on port 5432'
  echo 'Maybe run: "sudo service postgresql stop" or "npm stop"'
  exit 1
fi

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
