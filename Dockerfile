FROM node:16-alpine

WORKDIR /home/node/airbyte

COPY lerna.json .tsconfig.json package.json package-lock.json ./
RUN sed -i "/jest\|mockttp/d" package.json
COPY ./faros-airbyte-cdk ./faros-airbyte-cdk
COPY ./faros-airbyte-common ./faros-airbyte-common
#COPY ./sources ./sources
COPY ./sources/bitbucket-server-source ./sources/bitbucket-server-source
COPY ./destinations ./destinations
RUN apk add --no-cache --virtual .gyp python3 make g++ \
    && npm install -g lerna tsc
RUN lerna bootstrap --hoist
RUN apk del .gyp

ARG path
RUN test -n "$path" || (echo "'path' argument is not set, e.g --build-arg path=destinations/airbyte-faros-destination" && false)
ENV CONNECTOR_PATH $path

RUN ln -s "/home/node/airbyte/$CONNECTOR_PATH/bin/main" "/home/node/airbyte/main"

ENV AIRBYTE_ENTRYPOINT "/home/node/airbyte/main"
ENTRYPOINT ["/home/node/airbyte/main"]
