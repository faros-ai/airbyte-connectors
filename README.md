# Airbyte Connectors


[![CI](https://github.com/faros-ai/airbyte-connectors/actions/workflows/ci.yml/badge.svg)](https://github.com/faros-ai/airbyte-connectors/actions/workflows/ci.yml) [![Release](https://github.com/faros-ai/airbyte-connectors/actions/workflows/release.yml/badge.svg)](https://github.com/faros-ai/airbyte-connectors/actions/workflows/release.yml) [![CodeQL](https://github.com/faros-ai/airbyte-connectors/actions/workflows/codeql-analysis.yml/badge.svg)](https://github.com/faros-ai/airbyte-connectors/actions/workflows/codeql-analysis.yml) 

This repository contains [Airbyte](https://airbyte.io/) connectors used in [Faros](https://www.faros.ai) and [Faros Community Edition](https://github.com/faros-ai/faros-community-edition) platforms as well as Airbyte Connector Development Kit (CDK) for JavaScript/TypeScript.

See the READMEs inside `destinations/` and `sources/` subfolders for more information on each connector.

Component | Code | Installation | Version
----------|-----------|------|--------
Airbyte CDK | [faros-airbyte-cdk](faros-airbyte-cdk) | `npm i faros-airbyte-cdk` |[![npm package](https://img.shields.io/npm/v/faros-airbyte-cdk?color=blue&label=npm)](https://www.npmjs.com/package/faros-airbyte-cdk)
Bitbucket Source | [sources/bitbucket-source](sources/bitbucket-source) | `docker pull farosai/airbyte-bitbucket-source` | [![](https://img.shields.io/docker/v/farosai/airbyte-bitbucket-source?color=blue&label=docker)](https://hub.docker.com/r/farosai/airbyte-bitbucket-source/tags)
Customer.IO Source | [sources/customer-io-source](sources/customer-io-source) | `docker pull farosai/airbyte-customer-io-source` | [![](https://img.shields.io/docker/v/farosai/airbyte-customer-io-source?color=blue&label=docker)](https://hub.docker.com/r/farosai/airbyte-customer-io-source/tags)
Faros Destination | [destinations/faros-destination](destinations/faros-destination) | `docker pull farosai/airbyte-faros-destination` | [![](https://img.shields.io/docker/v/farosai/airbyte-faros-destination?color=blue&label=docker)](https://hub.docker.com/r/farosai/airbyte-faros-destination/tags)
Google Calendar Source | [sources/googlecalendar-source](sources/googlecalendar-source) | `docker pull farosai/airbyte-googlecalendar-source` | [![](https://img.shields.io/docker/v/farosai/airbyte-googlecalendar-source?color=blue&label=docker)](https://hub.docker.com/r/farosai/airbyte-googlecalendar-source/tags)
Harness Source | [sources/harness-source](sources/harness-source) | `docker pull farosai/airbyte-harness-source` | [![](https://img.shields.io/docker/v/farosai/airbyte-harness-source?color=blue&label=docker)](https://hub.docker.com/r/farosai/airbyte-harness-source/tags)
Jenkins Source | [sources/jenkins-source](sources/jenkins-source) | `docker pull farosai/airbyte-jenkins-source` | [![](https://img.shields.io/docker/v/farosai/airbyte-jenkins-source?color=blue&label=docker)](https://hub.docker.com/r/farosai/airbyte-jenkins-source/tags)
Okta Source | [sources/okta-source](sources/okta-source) | `docker pull farosai/airbyte-okta-source` | [![](https://img.shields.io/docker/v/farosai/airbyte-okta-source?color=blue&label=docker)](https://hub.docker.com/r/farosai/airbyte-okta-source/tags)
PagerDuty Source | [sources/pagerduty-source](sources/pagerduty-source) | `docker pull farosai/airbyte-pagerduty-source` | [![](https://img.shields.io/docker/v/farosai/airbyte-pagerduty-source?color=blue&label=docker)](https://hub.docker.com/r/farosai/airbyte-pagerduty-source/tags)
Phabricator Source | [sources/phabricator-source](sources/phabricator-source) | `docker pull farosai/airbyte-phabricator-source` | [![](https://img.shields.io/docker/v/farosai/airbyte-phabricator-source?color=blue&label=docker)](https://hub.docker.com/r/farosai/airbyte-phabricator-source/tags)
SquadCast Source | [sources/squadcast-source](sources/squadcast-source) | `docker pull farosai/airbyte-squadcast-source` | [![](https://img.shields.io/docker/v/farosai/airbyte-squadcast-source?color=blue&label=docker)](https://hub.docker.com/r/farosai/airbyte-squadcast-source/tags)
StatusPage Source | [sources/statuspage-source](sources/statuspage-source) | `docker pull farosai/airbyte-statuspage-source` | [![](https://img.shields.io/docker/v/farosai/airbyte-statuspage-source?color=blue&label=docker)](https://hub.docker.com/r/farosai/airbyte-statuspage-source/tags)
VictorOps Source | [sources/victorops-source](sources/victorops-source) | `docker pull farosai/airbyte-victorops-source` | [![](https://img.shields.io/docker/v/farosai/airbyte-victorops-source?color=blue&label=docker)](https://hub.docker.com/r/farosai/airbyte-victorops-source/tags)
Shortcut Source | [sources/shortcut-source](sources/shortcut-source) | `docker pull farosai/airbyte-shortcut-source` | [![](https://img.shields.io/docker/v/farosai/airbyte-shortcut-source?color=blue&label=docker)](https://hub.docker.com/r/farosai/airbyte-shortcut-source/tags)

# Development

1. Install [`nvm`](https://github.com/nvm-sh/nvm#installing-and-updating)
2. Install Node.js `nvm install 14 && nvm use 14`
3. Update `npm` to version 7.x by running `npm install -g npm@7`
4. Install `lerna` by running `npm install -g lerna`
5. Run `npm run prepare` to install dependencies for all projects (`npm run clean` to clean all)
6. Run `npm run build` to build all projects (for a single project add scope, e.g `npm run build -- --scope faros-destination`)
7. Run `npm run test` to test all projects (for a single project add scope, e.g `npm run test -- --scope faros-destination`)
8. Run `npm run lint` to apply linter on all projects (for a single project add scope, e.g `npm run lint -- --scope faros-destination`)

👉 Follow our guide on how to develop a new source [here](https://github.com/faros-ai/airbyte-connectors/tree/main/sources#developing-an-airbyte-source).

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
docker run faros-destination
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
