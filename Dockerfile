FROM node:18-alpine

WORKDIR /home/node/airbyte

COPY turbo.json .tsconfig.json package.json package-lock.json ./
RUN sed -i "/jest\|mockttp/d" package.json
COPY ./faros-airbyte-cdk ./faros-airbyte-cdk
COPY ./faros-airbyte-common ./faros-airbyte-common
COPY ./sources ./sources
COPY ./destinations ./destinations

RUN apk -U upgrade && \
    apk add --no-cache --virtual .gyp python3 py3-setuptools make g++ && \
    npm ci --no-audit --no-fund --ignore-scripts && \
    npm run build && \
    apk del .gyp

COPY ./docker ./docker

ARG version
RUN test -n "$version" || (echo "'version' argument is not set, e.g --build-arg version=x.y.z" && false)
ENV CONNECTOR_VERSION $version

ARG path
RUN test -n "$path" || (echo "'path' argument is not set, e.g --build-arg path=destinations/airbyte-faros-destination" && false)
ENV CONNECTOR_PATH $path

RUN ln -s "/home/node/airbyte/$CONNECTOR_PATH/bin/main" "/home/node/airbyte/main"

ENV AIRBYTE_ENTRYPOINT "/home/node/airbyte/docker/entrypoint.sh"
ENTRYPOINT ["/home/node/airbyte/docker/entrypoint.sh"]
