FROM node:16-alpine

WORKDIR /home/node/airbyte

ARG version
RUN test -n "$version" || (echo "'version' argument is not set, e.g --build-arg version=x.y.z" && false)
ENV CONNECTOR_VERSION $version

COPY lerna.json .tsconfig.json package.json package-lock.json ./
RUN sed -i "/jest\|mockttp/d" package.json
COPY ./faros-airbyte-cdk ./faros-airbyte-cdk
COPY ./faros-airbyte-common ./faros-airbyte-common
COPY ./sources ./sources
COPY ./destinations ./destinations
RUN apk add --no-cache --virtual .gyp python3 make g++ \
    && npm install -g lerna tsc
RUN lerna version $CONNECTOR_VERSION -y --no-git-tag-version --no-push --ignore-scripts && lerna bootstrap --hoist
RUN apk del .gyp

ARG path
RUN test -n "$path" || (echo "'path' argument is not set, e.g --build-arg path=destinations/airbyte-faros-destination" && false)
ENV CONNECTOR_PATH $path

RUN ln -s "/home/node/airbyte/$CONNECTOR_PATH/bin/main" "/home/node/airbyte/main"

ENV AIRBYTE_ENTRYPOINT "/home/node/airbyte/main"
ENTRYPOINT ["/home/node/airbyte/main"]
