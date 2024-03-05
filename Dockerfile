FROM node:18-alpine

WORKDIR /home/node/airbyte

RUN apk -U upgrade
RUN apk add --no-cache --virtual .gyp python3 make g++ \
    && npm install -g npm lerna @lerna/legacy-package-management tsc

COPY lerna.json .tsconfig.json package.json package-lock.json ./
RUN sed -i "/jest\|mockttp/d" package.json
COPY ./faros-airbyte-cdk ./faros-airbyte-cdk
COPY ./faros-airbyte-common ./faros-airbyte-common
COPY ./sources ./sources
COPY ./destinations ./destinations

RUN lerna bootstrap --hoist

ARG version
RUN test -n "$version" || (echo "'version' argument is not set, e.g --build-arg version=x.y.z" && false)
ENV CONNECTOR_VERSION $version

#RUN cp package-lock.json .package-lock.json.tmp \
    #&& lerna version $CONNECTOR_VERSION -y --no-git-tag-version --no-push --ignore-scripts --exact \
    #&& mv .package-lock.json.tmp package-lock.json
RUN apk del .gyp

ARG path
RUN test -n "$path" || (echo "'path' argument is not set, e.g --build-arg path=destinations/airbyte-faros-destination" && false)
RUN ln -s "/home/node/airbyte/$path/bin/main" "/home/node/airbyte/main"

USER node

ENV AIRBYTE_ENTRYPOINT "/home/node/airbyte/main"
ENTRYPOINT ["/home/node/airbyte/main"]
