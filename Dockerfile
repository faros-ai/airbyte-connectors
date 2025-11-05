# Stage 1: Build stage
FROM node:22-alpine AS builder

WORKDIR /home/node/airbyte

COPY turbo.json .tsconfig.json package.json package-lock.json ./
RUN sed -i "/jest/d" package.json
COPY ./faros-airbyte-cdk ./faros-airbyte-cdk
COPY ./faros-airbyte-common ./faros-airbyte-common
COPY ./sources ./sources
COPY ./destinations ./destinations

RUN apk -U upgrade && \
    apk add --no-cache --virtual .gyp python3 py3-setuptools make g++ && \
    npm ci --no-audit --no-fund --ignore-scripts && \
    npm run build && \
    apk del .gyp && \
    npm prune --production && \
    find . -name "*.ts" -type f -delete && \
    find . -name "*.tsx" -type f -delete && \
    find . -name "tsconfig.json" -type f -delete && \
    find . -name ".tsconfig.json" -type f -delete && \
    rm -f turbo.json

# Stage 2: Runtime stage
FROM node:22-alpine

WORKDIR /home/node/airbyte

# Copy only production files from builder
COPY --from=builder /home/node/airbyte/node_modules ./node_modules
COPY --from=builder /home/node/airbyte/faros-airbyte-cdk ./faros-airbyte-cdk
COPY --from=builder /home/node/airbyte/faros-airbyte-common ./faros-airbyte-common
COPY --from=builder /home/node/airbyte/sources ./sources
COPY --from=builder /home/node/airbyte/destinations ./destinations

COPY ./docker ./docker

ENV OTEL_SERVICE_NAME=airbyte
ENV OTEL_NODE_ENABLED_INSTRUMENTATIONS=http,koa

ARG version
RUN test -n "$version" || (echo "'version' argument is not set, e.g --build-arg version=x.y.z" && false)
ENV CONNECTOR_VERSION=$version

ARG path
RUN test -n "$path" && \
    echo "path argument is set to: $path" || \
    (echo "'path' argument is not set, e.g --build-arg path=destinations/airbyte-faros-destination" && false)
ENV CONNECTOR_PATH=$path

RUN ln -s "/home/node/airbyte/$CONNECTOR_PATH/bin/main" "/home/node/airbyte/main"

ENV AIRBYTE_ENTRYPOINT="/home/node/airbyte/docker/entrypoint.sh"
ENTRYPOINT ["/home/node/airbyte/docker/entrypoint.sh"]
