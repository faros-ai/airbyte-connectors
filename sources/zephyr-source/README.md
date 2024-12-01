# Zephyr Source

This is the repository for the Zephyr source connector, written in Typescript.

## Local development

### Prerequisites

**To iterate on this connector, make sure to complete this prerequisites
section.**

#### Minimum Node.js version required `= 18`

#### Build connector

From the root repository directory (NOT this folder), run:

```
npm run prepare
```

This will install all required dependencies and build all included connectors,
including the Zephyr source connector.

Now you can cd into the Zephyr connector directory, `sources/zephyr-source`,
and iterate on the Zephyr source connector. After making code changes, run:

```
npm run build
```

#### Create credentials

### Locally running the connector

```
bin/main spec
bin/main check --config secrets/config.json
bin/main discover --config secrets/config.json
bin/main read --config secrets/config.json --catalog test_files/full_configured_catalog.json
```

### Locally running the connector docker image

#### Build

Go back to the root repository directory and run follow the instructions under
Build Docker Images in the [README](../../README.md)

#### Run

Then return to the Zephyr connector directory and run any of the connector
commands as follows:

```
docker run --rm zephyr-source spec
docker run --rm -v $(pwd)/secrets:/secrets zephyr-source check --config /secrets/config.json
docker run --rm -v $(pwd)/secrets:/secrets zephyr-source discover --config /secrets/config.json
docker run --rm -v $(pwd)/secrets:/secrets -v $(pwd)/test_files:/test_files zephyr-source read --config /secrets/config.json --catalog /test_files/full_configured_catalog.json
```

## Testing

### Unit Tests

To run unit tests locally, from the Zephyr connector directory run:

```
npm test
```