FROM node:18-alpine

WORKDIR /home/node/airbyte

COPY turbo.json .tsconfig.json package.json package-lock.json ./
RUN sed -i "/jest\|mockttp/d" package.json
COPY ./faros-airbyte-cdk ./faros-airbyte-cdk
COPY ./faros-airbyte-common ./faros-airbyte-common
COPY ./sources ./sources
COPY ./destinations ./destinations

# Update packages and install build dependencies
RUN apk -U upgrade && \
    apk add --no-cache --virtual .gyp python3 py3-setuptools make g++

# Install dependencies using npm workspaces
RUN npm ci --no-audit --no-fund --ignore-scripts

# Build the packages using Turborepo
RUN npm run build

# Remove build dependencies
RUN apk del .gyp

# Copy the docker directory
COPY ./docker ./docker

ARG version
RUN test -n "$version" || (echo "'version' argument is not set, e.g --build-arg version=x.y.z" && false)
ENV CONNECTOR_VERSION $version

#RUN cp package-lock.json .package-lock.json.tmp \
    #&& lerna version $CONNECTOR_VERSION -y --no-git-tag-version --no-push --ignore-scripts --exact \
    #&& mv .package-lock.json.tmp package-lock.json
RUN apk del .gyp

ARG path
RUN test -n "$path" || (echo "'path' argument is not set, e.g --build-arg path=destinations/airbyte-faros-destination" && false)
ENV CONNECTOR_PATH $path

RUN ln -s "/home/node/airbyte/$CONNECTOR_PATH/bin/main" "/home/node/airbyte/main"

ENV AIRBYTE_ENTRYPOINT "/home/node/airbyte/docker/entrypoint.sh"
ENTRYPOINT ["/home/node/airbyte/docker/entrypoint.sh"]
