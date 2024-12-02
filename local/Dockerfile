FROM farosai/airbyte-faros-destination:latest

WORKDIR /home/node/airbyte

COPY turbo.json .tsconfig.json package.json package-lock.json ./
RUN sed -i "/jest\|mockttp/d" package.json
COPY ./faros-airbyte-cdk ./faros-airbyte-cdk
COPY ./faros-airbyte-common ./faros-airbyte-common
COPY ./sources ./sources
COPY ./destinations ./destinations

RUN npm install turbo --global --ignore-scripts
RUN npm run build -- --filter faros-airbyte-cdk
RUN npm run build -- --filter faros-airbyte-common

COPY ./docker ./docker

ARG version
ENV CONNECTOR_VERSION $version

ARG path
RUN test -n "$path" || (echo "'path' argument is not set, e.g --build-arg path=destinations/airbyte-faros-destination" && false)
RUN scope=$(echo "$path" | awk -F'/' '{print $NF}') && npm run build -- --filter "$scope"
RUN ln -sf "/home/node/airbyte/$path/bin/main" "/home/node/airbyte/main"

USER node

ENV AIRBYTE_ENTRYPOINT "/home/node/airbyte/docker/entrypoint.sh"
ENTRYPOINT ["/home/node/airbyte/docker/entrypoint.sh"]
