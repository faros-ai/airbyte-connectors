# Customer.io Source for Airbyte

📦 Docker Image: https://hub.docker.com/r/farosai/airbyte-customer-io-source

Use this source to import [Customer.io](https://customer.io) API data into Airbyte.

## Recommended Usage

A recommended approach if you'd like more detailed message delivery metrics is to enable the [Customer.io -> S3 data warehouse integration](https://customer.io/docs/data-warehouse-sync/#s3-bucket), and then use the [S3 Airbyte source connector](https://docs.airbyte.io/integrations/sources/s3) to import the parquet files as needed.

This source is useful for importing Customer.io resource metadata (such as campaign or action names). The following Customer.io resources are currently available:

- `campaigns`
- `campaign_actions`
- `newsletters`

```shell
docker pull farosai/airbyte-customer-io-source
docker run farosai/airbyte-customer-io-source
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
including the Customer.io source connector.

Now you can cd into the Customer.io connector directory, `sources/customer-io-source`,
and iterate on the Customer.io source connector. After making code changes, run:

```
npm run build
```

#### Create credentials

Follow the instructions in the
[documentation](https://docs.airbyte.io/integrations/sources/customer-io) to
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
docker build . --build-arg path=sources/customer-io-source --build-arg version=0.0.1 -t customer-io-source
```

#### Run

Then return to the Customer.io connector directory and run any of the connector
commands as follows:

```
docker run --rm customer-io-source spec
docker run --rm -v $(pwd)/secrets:/secrets customer-io-source check --config /secrets/config.json
docker run --rm -v $(pwd)/secrets:/secrets customer-io-source discover --config /secrets/config.json
docker run --rm -v $(pwd)/secrets:/secrets -v $(pwd)/test_files:/test_files customer-io-source read --config /secrets/config.json --catalog /test_files/full_configured_catalog.json
```

## Testing

### Unit Tests

To run unit tests locally, from the Customer.io connector directory run:

```
npm test
```
