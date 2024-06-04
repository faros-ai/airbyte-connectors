# Xray Source

This is the repository for the Xray source connector, written in Typescript.

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
including the Xray source connector.

Now you can cd into the Xray connector directory, `sources/xray-source`,
and iterate on the Xray source connector. After making code changes, run:

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

Then return to the Xray connector directory and run any of the connector
commands as follows:

```
docker run --rm xray-source spec
docker run --rm -v $(pwd)/secrets:/secrets xray-source check --config /secrets/config.json
docker run --rm -v $(pwd)/secrets:/secrets xray-source discover --config /secrets/config.json
docker run --rm -v $(pwd)/secrets:/secrets -v $(pwd)/test_files:/test_files xray-source read --config /secrets/config.json --catalog /test_files/full_configured_catalog.json
```

## Testing

### Unit Tests

To run unit tests locally, from the Xray connector directory run:

```
npm test
```

## Dependency Management

We use [lerna](https://lerna.js.org/) to manage dependencies that are shared by
all connectors in this repository. Dependencies specific to this connector
should go in the connector's `package.json`. Dependencies shared by all
connectors, such as linting/formatting tools, should go in the root
`package.json`.
