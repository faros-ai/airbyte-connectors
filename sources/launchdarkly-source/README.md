# LaunchDarkly Source

This is the repository for the LaunchDarkly source connector, written in TypeScript using the Faros Airbyte CDK.

## Local development

### Prerequisites

**To iterate on this connector, make sure to complete this prerequisites section.**

#### Minimum Node.js version required `= 22`

#### Build connector

From the root repository directory (NOT this folder), run:
```
npm i
turbo build --filter=launchdarkly-source
```

#### Create credentials

**If you are a community contributor**, follow the instructions in the [documentation](https://docs.airbyte.io/integrations/sources/launchdarkly) to generate the necessary credentials. Then create a file `secrets/config.json` conforming to the `resources/spec.json` file.

### Locally running the connector

```
node bin/main.js spec
node bin/main.js check --config secrets/config.json
node bin/main.js discover --config secrets/config.json
node bin/main.js read --config secrets/config.json --catalog integration_tests/configured_catalog.json
```

### Locally running the connector docker image

#### Build

From the root repository directory (NOT this folder), run:
```
docker build . --build-arg path=sources/launchdarkly-source --build-arg version=dev -t airbyte/launchdarkly-source:dev
```

#### Run

Then run any of the connector commands as follows:
```
docker run --rm airbyte/launchdarkly-source:dev spec
docker run --rm -v $(pwd)/secrets:/secrets airbyte/launchdarkly-source:dev check --config /secrets/config.json
docker run --rm -v $(pwd)/secrets:/secrets airbyte/launchdarkly-source:dev discover --config /secrets/config.json
docker run --rm -v $(pwd)/secrets:/secrets -v $(pwd)/integration_tests:/integration_tests airbyte/launchdarkly-source:dev read --config /secrets/config.json --catalog /integration_tests/configured_catalog.json
```

## Testing

From the root repository directory (NOT this folder), run:
```
turbo test --filter=launchdarkly-source
```

### Acceptance Tests

Customize `acceptance-test-config.yml` file to configure tests. See [Connector Acceptance Tests](https://docs.airbyte.io/connector-development/testing-connectors/connector-acceptance-tests-reference) for more information.
If your connector requires to create or destroy resources for use during acceptance tests create operations can be placed in the `setup` block and operations to clean up can be placed in the `teardown` block in the `acceptance-test-config.yml` file.

To run your integration tests with acceptance tests, from the root repository directory, run
```
turbo test --filter=launchdarkly-source
```

## Configuration

| Input | Type | Description | Default Value |
|-------|------|-------------|---------------|
| `token` | `string` | LaunchDarkly Access Token. Personal or service access token for LaunchDarkly API |  |
| `page_size` | `integer` | Page Size. Number of items to fetch per page | 20 |
| `custom_streams` | `array` | Custom Streams. List of streams to run (if empty, all available streams will run) |  |

## Streams

| Stream | Primary Key | Pagination | Supports Full Sync | Supports Incremental |
|--------|-------------|------------|---------------------|----------------------|
| projects | key | Default paginator | ✅ |  ❌  |
| environments | key | Default paginator | ✅ |  ❌  |
| feature_flags | key | Default paginator | ✅ |  ✅  |
| users | key | Default paginator | ✅ |  ❌  |
| experiments | key | Default paginator | ✅ |  ❌  |

## Changelog

### launchdarkly-source
- Initial implementation of LaunchDarkly source connector
- Supports projects, environments, feature flags, users, and experiments streams
- Token-based authentication
- Incremental sync support for feature flags
- Rate limiting and error handling
