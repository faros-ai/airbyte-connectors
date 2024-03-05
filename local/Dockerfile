FROM farosai/airbyte-faros-destination:latest

WORKDIR /home/node/airbyte

COPY lerna.json .tsconfig.json package.json package-lock.json ./
RUN sed -i "/jest\|mockttp/d" package.json
COPY ./faros-airbyte-cdk ./faros-airbyte-cdk
COPY ./faros-airbyte-common ./faros-airbyte-common
COPY ./sources ./sources
COPY ./destinations ./destinations

RUN npm run build -- --scope faros-airbyte-cdk
RUN npm run build -- --scope faros-airbyte-common

ARG version

ARG path
RUN test -n "$path" || (echo "'path' argument is not set, e.g --build-arg path=destinations/airbyte-faros-destination" && false)
RUN scope=$(echo "$path" | awk -F'/' '{print $NF}') && npm run build -- --scope $scope
RUN ln -sf "/home/node/airbyte/$path/bin/main" "/home/node/airbyte/main"

USER node

ENTRYPOINT ["/home/node/airbyte/main"]
