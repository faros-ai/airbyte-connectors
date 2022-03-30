# Airbyte Connectors


[![CI](https://github.com/faros-ai/airbyte-connectors/actions/workflows/ci.yml/badge.svg)](https://github.com/faros-ai/airbyte-connectors/actions/workflows/ci.yml) [![Release](https://github.com/faros-ai/airbyte-connectors/actions/workflows/release.yml/badge.svg)](https://github.com/faros-ai/airbyte-connectors/actions/workflows/release.yml) [![CodeQL](https://github.com/faros-ai/airbyte-connectors/actions/workflows/codeql-analysis.yml/badge.svg)](https://github.com/faros-ai/airbyte-connectors/actions/workflows/codeql-analysis.yml) 

This repository contains [Airbyte](https://airbyte.io/) connectors used in [Faros](https://www.faros.ai) and [Faros Community Edition](https://github.com/faros-ai/faros-community-edition) platforms as well as Airbyte Connector Development Kit (CDK) for JavaScript/TypeScript.

See the READMEs inside `destinations/` and `sources/` subfolders for more information on each connector.

Component | Code | Installation | Version
----------|-----------|------|--------
Airbyte CDK | [faros-airbyte-cdk](faros-airbyte-cdk) | `npm i faros-airbyte-cdk` |[![npm package](https://img.shields.io/npm/v/faros-airbyte-cdk?color=blue&label=npm)](https://www.npmjs.com/package/faros-airbyte-cdk)
Azure Active Directory Source | [sources/azureactivedirectory-source](sources/azureactivedirectory-source) | `docker pull farosai/airbyte-azureactivedirectory-source` | [![](https://img.shields.io/docker/v/farosai/airbyte-azureactivedirectory-source?color=blue&label=docker)](https://hub.docker.com/r/farosai/airbyte-azureactivedirectory-source/tags)
Backlog Source | [sources/backlog-source](sources/backlog-source) | `docker pull farosai/airbyte-backlog-source` | [![](https://img.shields.io/docker/v/farosai/airbyte-backlog-source?color=blue&label=docker)](https://hub.docker.com/r/farosai/airbyte-backlog-source/tags)
Bitbucket Source | [sources/bitbucket-source](sources/bitbucket-source) | `docker pull farosai/airbyte-bitbucket-source` | [![](https://img.shields.io/docker/v/farosai/airbyte-bitbucket-source?color=blue&label=docker)](https://hub.docker.com/r/farosai/airbyte-bitbucket-source/tags)
Customer.IO Source | [sources/customer-io-source](sources/customer-io-source) | `docker pull farosai/airbyte-customer-io-source` | [![](https://img.shields.io/docker/v/farosai/airbyte-customer-io-source?color=blue&label=docker)](https://hub.docker.com/r/farosai/airbyte-customer-io-source/tags)
Datadog Source | [sources/datadog-source](sources/datadog-source) | `docker pull farosai/airbyte-datadog-source` | [![](https://img.shields.io/docker/v/farosai/airbyte-datadog-source?color=blue&label=docker)](https://hub.docker.com/r/farosai/airbyte-datadog-source/tags)
Docker Source | [sources/docker-source](sources/docker-source) | `docker pull farosai/airbyte-docker-source` | [![](https://img.shields.io/docker/v/farosai/airbyte-docker-source?color=blue&label=docker)](https://hub.docker.com/r/farosai/airbyte-docker-source/tags)
Faros Destination | [destinations/airbyte-faros-destination](destinations/airbyte-faros-destination) | `npm i airbyte-faros-destination` or `docker pull farosai/airbyte-faros-destination` | [![npm package](https://img.shields.io/npm/v/airbyte-faros-destination?color=blue&label=npm)](https://www.npmjs.com/package/airbyte-faros-destination) [![](https://img.shields.io/docker/v/farosai/airbyte-faros-destination?color=blue&label=docker)](https://hub.docker.com/r/farosai/airbyte-faros-destination/tags)
FireHydrant Source | [sources/firehydrant-source](sources/firehydrant-source) | `docker pull farosai/airbyte-firehydrant-source` | [![](https://img.shields.io/docker/v/farosai/airbyte-firehydrant-source?color=blue&label=docker)](https://hub.docker.com/r/farosai/airbyte-firehydrant-source/tags)
Google Calendar Source | [sources/googlecalendar-source](sources/googlecalendar-source) | `docker pull farosai/airbyte-googlecalendar-source` | [![](https://img.shields.io/docker/v/farosai/airbyte-googlecalendar-source?color=blue&label=docker)](https://hub.docker.com/r/farosai/airbyte-googlecalendar-source/tags)
Harness Source | [sources/harness-source](sources/harness-source) | `docker pull farosai/airbyte-harness-source` | [![](https://img.shields.io/docker/v/farosai/airbyte-harness-source?color=blue&label=docker)](https://hub.docker.com/r/farosai/airbyte-harness-source/tags)
Jenkins Source | [sources/jenkins-source](sources/jenkins-source) | `docker pull farosai/airbyte-jenkins-source` | [![](https://img.shields.io/docker/v/farosai/airbyte-jenkins-source?color=blue&label=docker)](https://hub.docker.com/r/farosai/airbyte-jenkins-source/tags)
Okta Source | [sources/okta-source](sources/okta-source) | `docker pull farosai/airbyte-okta-source` | [![](https://img.shields.io/docker/v/farosai/airbyte-okta-source?color=blue&label=docker)](https://hub.docker.com/r/farosai/airbyte-okta-source/tags)
PagerDuty Source | [sources/pagerduty-source](sources/pagerduty-source) | `docker pull farosai/airbyte-pagerduty-source` | [![](https://img.shields.io/docker/v/farosai/airbyte-pagerduty-source?color=blue&label=docker)](https://hub.docker.com/r/farosai/airbyte-pagerduty-source/tags)
Phabricator Source | [sources/phabricator-source](sources/phabricator-source) | `docker pull farosai/airbyte-phabricator-source` | [![](https://img.shields.io/docker/v/farosai/airbyte-phabricator-source?color=blue&label=docker)](https://hub.docker.com/r/farosai/airbyte-phabricator-source/tags)
Shortcut Source | [sources/shortcut-source](sources/shortcut-source) | `docker pull farosai/airbyte-shortcut-source` | [![](https://img.shields.io/docker/v/farosai/airbyte-shortcut-source?color=blue&label=docker)](https://hub.docker.com/r/farosai/airbyte-shortcut-source/tags)
SquadCast Source | [sources/squadcast-source](sources/squadcast-source) | `docker pull farosai/airbyte-squadcast-source` | [![](https://img.shields.io/docker/v/farosai/airbyte-squadcast-source?color=blue&label=docker)](https://hub.docker.com/r/farosai/airbyte-squadcast-source/tags)
StatusPage Source | [sources/statuspage-source](sources/statuspage-source) | `docker pull farosai/airbyte-statuspage-source` | [![](https://img.shields.io/docker/v/farosai/airbyte-statuspage-source?color=blue&label=docker)](https://hub.docker.com/r/farosai/airbyte-statuspage-source/tags)
VictorOps Source | [sources/victorops-source](sources/victorops-source) | `docker pull farosai/airbyte-victorops-source` | [![](https://img.shields.io/docker/v/farosai/airbyte-victorops-source?color=blue&label=docker)](https://hub.docker.com/r/farosai/airbyte-victorops-source/tags)

# Development

1. Install [`nvm`](https://github.com/nvm-sh/nvm#installing-and-updating)
2. Install Node.js `nvm install 14 && nvm use 14`
3. Update `npm` to version 7.x by running `npm install -g npm@7`
4. Install `lerna` by running `npm install -g lerna`
5. Run `npm run prepare` to install dependencies for all projects (`npm run clean` to clean all)
6. Run `npm run build` to build all projects (for a single project add scope, e.g `npm run build -- --scope airbyte-faros-destination`)
7. Run `npm run test` to test all projects (for a single project add scope, e.g `npm run test -- --scope airbyte-faros-destination`)
8. Run `npm run lint` to apply linter on all projects (for a single project add scope, e.g `npm run lint -- --scope airbyte-faros-destination`)

👉 Follow our guide on how to develop a new source [here](https://github.com/faros-ai/airbyte-connectors/tree/main/sources#developing-an-airbyte-source).

## Other Useful Commands

1. Audit fix `npm audit fix`
2. Clean your project `lerna run clean` (sometimes you also wanna `rm -rf ./node_modules`)

Read more about `lerna` here - https://github.com/lerna/lerna

# Build Docker Images

In order to build a Docker image for a connector run the `docker build` command and set `path` argument.
For example for Faros Destination connector run:

```shell
docker build . --build-arg path=destinations/airbyte-faros-destination -t airbyte-faros-destination
```

And then run it:
```shell
docker run airbyte-faros-destination
```

# Releasing

We use GitHub Actions to automatically create a corresponding tag, publish the packages to [NPM](https://www.npmjs.com) and push Docker images to [Docker Hub](https://hub.docker.com/u/farosai).

1. Run `npm run bump` from the root of the repository. You will be prompted with a list of version increments to choose
from (patch, minor, major, etc). Choose the desired increment.
2. Commit and push the changed files into a branch, then open a PR into the main branch.
3. Once the PR is approved and merged, [the release workflow](https://github.com/faros-ai/airbyte-connectors/actions/workflows/release.yml) is triggered.

**Note:** If a connector is updated without incrementing the version, the release workflow will **NOT** overwrite the existing package/image.
