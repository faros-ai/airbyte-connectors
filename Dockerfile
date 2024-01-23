FROM node:21.6.0-bullseye-slim

WORKDIR /home/node/airbyte

COPY lerna.json .tsconfig.json package.json package-lock.json ./
RUN sed -i "/jest\|mockttp/d" package.json

COPY ./faros-airbyte-cdk ./faros-airbyte-cdk
COPY ./faros-airbyte-common ./faros-airbyte-common
COPY ./sources ./sources
COPY ./destinations ./destinations

# Update the package list and upgrade all the installed packages to their latest versions
RUN apt-get update && apt-get upgrade -y

# Install Python3, make, and g++ and mark them for automatic removal later if no longer needed
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++

# Install lerna, @lerna/legacy-package-management, and TypeScript Compiler (tsc) 
RUN npm install -g lerna @lerna/legacy-package-management tsc

# Clean up the apt cache to reduce image size
# This is often done in Debian-based Docker images to keep them slim
RUN apt-get clean && rm -rf /var/lib/apt/lists/*

RUN lerna bootstrap --hoist

ARG version
RUN test -n "$version" || (echo "'version' argument is not set, e.g --build-arg version=x.y.z" && false)
ENV CONNECTOR_VERSION $version

ARG path
RUN test -n "$path" || (echo "'path' argument is not set, e.g --build-arg path=destinations/airbyte-faros-destination" && false)
ENV CONNECTOR_PATH $path

RUN ln -s "/home/node/airbyte/$CONNECTOR_PATH/bin/main" "/home/node/airbyte/main"

ENV AIRBYTE_ENTRYPOINT "/home/node/airbyte/main"
ENTRYPOINT ["/home/node/airbyte/main"]
