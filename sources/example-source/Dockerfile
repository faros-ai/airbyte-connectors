FROM node:14-alpine

WORKDIR /home/node/airbyte

COPY .tsconfig.json package.json package-lock.json ./
COPY ./src ./src
COPY ./resources ./resources
COPY ./bin ./bin

RUN npm i
RUN npm run build

USER node
ENV AIRBYTE_ENTRYPOINT "/home/node/airbyte/bin/main"
ENTRYPOINT ["/home/node/airbyte/bin/main"]
