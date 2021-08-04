FROM node:14-alpine

WORKDIR /home/node/airbyte
RUN npm install -g npm@7 lerna tsc

ARG path
RUN test -n "$path" || (echo "'path' argument is not set, e.g --build-arg path=destinations/faros-destination" && false)
ENV CONNECTOR_PATH $path

RUN mkdir -p ./$CONNECTOR_PATH

COPY lerna.json .tsconfig.json package.json package-lock.json ./
COPY ./$CONNECTOR_PATH/package.json ./$CONNECTOR_PATH
COPY ./$CONNECTOR_PATH/src ./$CONNECTOR_PATH/src
COPY ./$CONNECTOR_PATH/resources ./$CONNECTOR_PATH/resources
COPY ./$CONNECTOR_PATH/bin ./$CONNECTOR_PATH/bin

RUN lerna bootstrap --hoist --scope $(basename ${CONNECTOR_PATH})
RUN lerna run build --scope $(basename ${CONNECTOR_PATH})
RUN ln -s "/home/node/airbyte/$CONNECTOR_PATH/bin/main" "/home/node/airbyte/main"

USER node

ENV AIRBYTE_ENTRYPOINT "/home/node/airbyte/main"
ENTRYPOINT ["/home/node/airbyte/main"]