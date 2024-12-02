# Semaphore CI Source

This is the repository for the Semaphore CI source connector, written in Typescript.

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
including the Semaphore CI source connector.

Now you can cd into the Semaphore CI connector directory, `sources/semaphoreci-source`,
and iterate on the Semaphore CI source connector. After making code changes, run:

```
npm run build
```

#### Create credentials

Provide necessary credentials:

`token` - Log into your Semaphore account and then generate a [personal authentication token](https://docs.semaphoreci.com/reference/api-v1alpha/#authentication).

`organization` - Name of Semaphore organization

Then create a file `secrets/config.json`
conforming to the `resources/spec.json` file. Note that any directory named
`secrets` is gitignored across the entire `airbyte-connectors` repo, so there is
no danger of accidentally checking in sensitive information. See
`test_files/config.json` for a sample config file.

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
docker build . --build-arg path=sources/semaphoreci-source --build-arg version=0.0.1 -t semaphoreci-source
```

#### Run

Then return to the Semaphore CI connector directory and run any of the connector
commands as follows:

```
docker run --rm semaphoreci-source spec
docker run --rm -v $(pwd)/secrets:/secrets semaphoreci-source check --config /secrets/config.json
docker run --rm -v $(pwd)/secrets:/secrets semaphoreci-source discover --config /secrets/config.json
docker run --rm -v $(pwd)/secrets:/secrets -v $(pwd)/test_files:/test_files semaphoreci-source read --config /secrets/config.json --catalog /test_files/full_configured_catalog.json
```

## Testing

### Unit Tests

To run unit tests locally, from the Semaphore CI connector directory run:

```
npm test
```
