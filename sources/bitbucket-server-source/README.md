# Bitbucket Server Source

This is the repository for the Bitbucket Server source connector, written in Typescript.

## Local development

### Prerequisites

**To iterate on this connector, make sure to complete this prerequisites
section.**

#### Minimum Node.js version required `= 16.x`

#### Build connector

From the root repository directory (NOT this folder), run:

```
npm run prepare
```

This will install all required dependencies and build all included connectors,
including the Bitbucket Server source connector.

Now you can cd into the Bitbucket Server connector directory, `sources/bitbucket-server-source`,
and iterate on the Bitbucket Server source connector. After making code changes, run:

```
npm run build
```

#### Create credentials

Follow the instructions in the
[documentation](https://confluence.atlassian.com/bitbucketserver/personal-access-tokens-939515499.html) to
generate a HTTP access token. Then create a file `secrets/config.json`
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
docker build . --build-arg path=sources/bitbucket-server-source --build-arg version=0.0.1 -t bitbucket-server-source
```

#### Run

Then return to the Bitbucket Server connector directory and run any of the connector
commands as follows:

```
docker run --rm bitbucket-server-source spec
docker run --rm -v $(pwd)/secrets:/secrets bitbucket-server-source check --config /secrets/config.json
docker run --rm -v $(pwd)/secrets:/secrets bitbucket-server-source discover --config /secrets/config.json
docker run --rm -v $(pwd)/secrets:/secrets -v $(pwd)/test_files:/test_files bitbucket-server-source read --config /secrets/config.json --catalog /test_files/full_configured_catalog.json
```

## Testing

### Unit Tests

To run unit tests locally, from the Bitbucket Server connector directory run:

```
npm test
```
