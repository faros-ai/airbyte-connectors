FROM farosai/airbyte-faros-destination:0.5.32

WORKDIR /home/node/airbyte

COPY lerna.json .tsconfig.json package.json package-lock.json ./
RUN sed -i "/jest\|mockttp/d" package.json
COPY ./faros-airbyte-cdk ./faros-airbyte-cdk
COPY ./faros-airbyte-common ./faros-airbyte-common
COPY ./sources ./sources
COPY ./destinations ./destinations

#RUN npm run build -- --scope faros-airbyte-cdk
#RUN npm run build -- --scope clickup-source
#RUN npm run build -- --scope airbyte-faros-destination
#RUN lerna bootstrap --hoist

ARG version
RUN test -n "$version" || (echo "'version' argument is not set, e.g --build-arg version=x.y.z" && false)
ENV CONNECTOR_VERSION $version

RUN cp package-lock.json .package-lock.json.tmp \
    && lerna version $CONNECTOR_VERSION -y --no-git-tag-version --no-push --ignore-scripts --exact \
    && mv .package-lock.json.tmp package-lock.json

ARG path
RUN test -n "$path" || (echo "'path' argument is not set, e.g --build-arg path=destinations/airbyte-faros-destination" && false)
ENV CONNECTOR_PATH $path

RUN ln -sf "/home/node/airbyte/$CONNECTOR_PATH/bin/main" "/home/node/airbyte/main"

ENV AIRBYTE_ENTRYPOINT "/home/node/airbyte/main"
ENTRYPOINT ["/home/node/airbyte/main"]
