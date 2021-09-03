# Airbyte Connectors

This repository contains [Airbyte](https://airbyte.io/) CDK and connectors implementations.
See the READMEs inside `destinations/` and `sources/` subfolders for more information on each connector.

|   |  Status |
|:-:|:-:|
|  Build |  [![CI](https://github.com/faros-ai/airbyte-connectors/actions/workflows/ci.yml/badge.svg)](https://github.com/faros-ai/airbyte-connectors/actions/workflows/ci.yml)  |
| Release  | [![Release](https://github.com/faros-ai/airbyte-connectors/actions/workflows/release.yml/badge.svg)](https://github.com/faros-ai/airbyte-connectors/actions/workflows/release.yml)  |
| CDK  | [![npm version](https://badge.fury.io/js/faros-airbyte-cdk.svg)](https://badge.fury.io/js/faros-airbyte-cdk)  |

# Development

1. Install [`nvm`](https://github.com/nvm-sh/nvm#installing-and-updating)
2. Install Node.js `nvm install 14 && nvm use 14`
3. Update `npm` to version 7.x by running `npm install -g npm@7`
4. Install `lerna` by running `npm install -g lerna`
5. Run `lerna bootstrap --hoist` to install dependencies for all projects
6. Run `lerna run build` to build all projects (for a single project add scope, e.g `--scope faros-destination`)
7. Run `lerna run test` to test all projects (for a single project add scope, e.g `--scope faros-destination`)
8. Run `lerna run lint` to apply linter on all projects (for a single project add scope, e.g `--scope faros-destination`)

## Other useful commands

1. Audit fix `npm audit fix`
2. Clean your project `lerna run clean` (sometimes you also wanna `rm -rf ./node_modules`)

Read more about `lerna` here - https://github.com/lerna/lerna

# Build Docker images

In order to build a Docker image for a connector run the `docker build` command and set `path` argument.
For example for Faros Destination connector run:

```shell
docker build . --build-arg path=destinations/faros-destination -t faros-destination
```

And then run it:
```shell
docker run faros-destination --help
```

# Releasing

## Publish CDK to NPM

To publish the CDK package to [NPM](https://www.npmjs.com), run `npm run bump` from the root of the
repository. You will be prompted with a list of version increments to choose
from (patch, minor, major, etc). Choose the desired increment, then commit and
push the changed files. GitHub will automatically create a corresponding tag and
publish the CDK to NPM once the changed files are merged to the main branch.

## Publish Connector Docker images

Connector Docker images are automatically published to Docker Hub after updates
to the main branch. They are tagged by the version listed in the connector's
`package.json`. If the connector is updated without incrementing the version,
GitHub will **NOT** overwrite the existing image in Docker Hub.
