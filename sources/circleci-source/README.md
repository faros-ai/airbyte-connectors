# CircleCI Source for Airbyte

📦 Docker Image: https://hub.docker.com/r/farosai/airbyte-circleci-source

Use this source to import [CircleCI](https://circleci) API data into Airbyte.

## Recommended Usage

A recommended approach if you'd like more detailed message delivery metrics is to enable the [CircleCI -> S3 data warehouse integration](https://circleci/docs/data-warehouse-sync/#s3-bucket), and then use the [S3 Airbyte source connector](https://docs.airbyte.io/integrations/sources/s3) to import the parquet files as needed.

This source is useful for importing CircleCI resource metadata (such as campaign or action names). The following CircleCI resources are currently available:

- `campaigns`
- `campaign_actions`
- `newsletters`

```shell
docker pull farosai/airbyte-circleci-source
docker run farosai/airbyte-circleci-source
```

## Local development

### Prerequisites

**To iterate on this connector, make sure to complete this prerequisites
section.**

#### Minimum Node.js version required `= 14.5`

#### Build connector

From the root repository directory (NOT this folder), run:

```
npm run prepare
```

This will install all required dependencies and build all included connectors,
including the CircleCI source connector.

Now you can cd into the CircleCI connector directory, `sources/circleci-source`,
and iterate on the CircleCI source connector. After making code changes, run:

```
npm run build
```

#### Create credentials

Follow the instructions in the
[documentation](https://docs.airbyte.io/integrations/sources/circleci) to
generate the necessary credentials. Then create a file `secrets/config.json`
conforming to the `resources/spec.json` file. Note that any directory named
`secrets` is gitignored across the entire `airbyte-connectors` repo, so there is
no danger of accidentally checking in sensitive information.

### Locally running the connector

```
bin/main spec
bin/main check --config secrets/config.json
bin/main discover --config secrets/config.json
bin/main read --config secrets/config.json --catalog test_files/full_configured_catalog.json
```

### Locally running the connector docker image

#### Build

Go back to the root repository directory and run:
First, make sure you build the latest Docker image:

```
docker build . --build-arg path=sources/circleci-source --build-arg version=0.0.1 -t circleci-source
```

#### Run

Then return to the CircleCI connector directory and run any of the connector
commands as follows:

```
docker run --rm circleci-source spec
docker run --rm -v $(pwd)/secrets:/secrets circleci-source check --config /secrets/config.json
docker run --rm -v $(pwd)/secrets:/secrets circleci-source discover --config /secrets/config.json
docker run --rm -v $(pwd)/secrets:/secrets -v $(pwd)/test_files:/test_files circleci-source read --config /secrets/config.json --catalog /test_files/full_configured_catalog.json
```

## Testing

### Unit Tests

To run unit tests locally, from the CircleCI connector directory run:

```
npm test
```


## Dependency Management

We use [lerna](https://lerna.js.org/) to manage dependencies that are shared by
all connectors in this repository. Dependencies specific to this connector
should go in the connector's `package.json`. Dependencies shared by all
connectors, such as linting/formatting tools, should go in the root
`package.json`.
