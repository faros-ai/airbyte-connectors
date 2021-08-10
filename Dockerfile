FROM node:14-alpine

WORKDIR /home/node/airbyte
RUN npm install -g npm@7 lerna tsc

ARG path
RUN test -n "$path" || (echo "'path' argument is not set, e.g --build-arg path=destinations/faros-destination" && false)
ENV CONNECTOR_PATH $path

RUN mkdir -p ./$CONNECTOR_PATH
RUN mkdir -p ./cdk

COPY lerna.json .tsconfig.json package.json package-lock.json ./
RUN sed -i "/eslint\|husky\|jest\|lint-staged\|prettier/d" package.json
COPY ./cdk/package.json ./cdk
COPY ./cdk/src ./cdk/src
COPY ./$CONNECTOR_PATH/package.json ./$CONNECTOR_PATH

# Add minimum files necessary to run lerna bootstrap first for Docker cache
RUN mkdir -p ./$CONNECTOR_PATH/src
RUN touch ./$CONNECTOR_PATH/src/index.ts
COPY ./$CONNECTOR_PATH/src/tsconfig.json ./$CONNECTOR_PATH/src/tsconfig.json
RUN lerna bootstrap --hoist

COPY ./$CONNECTOR_PATH/src ./$CONNECTOR_PATH/src
COPY ./$CONNECTOR_PATH/resources ./$CONNECTOR_PATH/resources
COPY ./$CONNECTOR_PATH/bin ./$CONNECTOR_PATH/bin
RUN lerna run build

RUN ln -s "/home/node/airbyte/$CONNECTOR_PATH/bin/main" "/home/node/airbyte/main"

USER node
ENV AIRBYTE_ENTRYPOINT "/home/node/airbyte/main"
ENTRYPOINT ["/home/node/airbyte/main"]
