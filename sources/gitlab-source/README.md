# GitLab Source

This is an [Airbyte](https://airbyte.io) source connector for GitLab.

## Local development

### Prerequisites
**To iterate on this connector, make sure to complete this prerequisites section.**

#### Minimum Node.js version required `14.5`

#### Build connector
From the root repository directory, run:
```
npm run prepare
```

#### Build connector with current changes
From the root repository directory, run:
```
npm run build:gitlab-source
```

#### Run tests
From the root repository directory, run:
```
npm run test:gitlab-source
```

### Locally running the connector
```
bin/main spec
bin/main check --config sample_files/config.json
bin/main discover --config sample_files/config.json
bin/main read --config sample_files/config.json --catalog sample_files/configured_catalog.json
```

### Locally running the connector docker image

#### Build
First, make sure you build the latest Docker image:
```
docker build -t airbyte/source-gitlab:dev .
```

#### Run
Then run any of the connector commands as follows:
```
docker run --rm airbyte/source-gitlab:dev spec
docker run --rm -v $(pwd)/sample_files:/sample_files airbyte/source-gitlab:dev check --config /sample_files/config.json
docker run --rm -v $(pwd)/sample_files:/sample_files airbyte/source-gitlab:dev discover --config /sample_files/config.json
docker run --rm -v $(pwd)/sample_files:/sample_files airbyte/source-gitlab:dev read --config /sample_files/config.json --catalog /sample_files/configured_catalog.json
```

## Supported sync modes
The GitLab source connector supports the following [sync modes](https://docs.airbyte.com/cloud/core-concepts#connection-sync-modes):
 - Full Refresh
 - Incremental

## Supported Streams
This source is capable of syncing the following streams:

* [Groups](https://docs.gitlab.com/ee/api/groups.html)

## API Authentication
GitLab supports the following authentication methods:
- [Personal Access Token](https://docs.gitlab.com/ee/user/profile/personal_access_tokens.html)

## Performance considerations
The connector is restricted by normal GitLab [rate limits](https://docs.gitlab.com/ee/user/gitlab_com/index.html#gitlabcom-specific-rate-limits).

## Changelog

| Version | Date       | Pull Request                                             | Subject                                    |
| :------ | :--------- | :------------------------------------------------------- | :----------------------------------------- |
| 0.1.0   | 2025-05-16 | [PR#](https://github.com/faros-ai/airbyte-connectors/pull/) | Initial release. |
