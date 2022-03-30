FROM node:16.13-alpine3.15

RUN apk --no-cache add curl jq

LABEL org.opencontainers.image.authors="dev@doubledice.com"

VOLUME /dev_workdir

WORKDIR /dev_workdir

# Resolves "Error: EACCES: permission denied, mkdir '/root/.config/hardhat-nodejs'"
RUN chmod -R 777 /root
