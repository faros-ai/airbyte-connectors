# Jenkins Source

This is the repository for the Jenkins source connector, written in Typescript.
For information about how to use this connector within Airbyte, see [the
documentation](https://docs.airbyte.io/integrations/sources/jenkins).

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
including the Jenkins source connector.

Now you can cd into the Jenkins connector directory, `sources/jenkins-source`,
and iterate on the Jenkins source connector. After making code changes, run:

```
npm run build
```

#### Create credentials

Follow the instructions in the
[documentation](https://docs.airbyte.io/integrations/sources/jenkins) to
generate the necessary credentials. Then create a file `secrets/config.json`
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
docker build . --build-arg path=sources/jenkins-source --build-arg version=0.0.1 -t jenkins-source
```

#### Run

Then return to the Jenkins connector directory and run any of the connector
commands as follows:

```
docker run --rm jenkins-source spec
docker run --rm -v $(pwd)/secrets:/secrets jenkins-source check --config /secrets/config.json
docker run --rm -v $(pwd)/secrets:/secrets jenkins-source discover --config /secrets/config.json
docker run --rm -v $(pwd)/secrets:/secrets -v $(pwd)/test_files:/test_files jenkins-source read --config /secrets/config.json --catalog /test_files/full_configured_catalog.json
```

## Testing

### Unit Tests

To run unit tests locally, from the Jenkins connector directory run:

```
npm test
```


## Dependency Management

We use [lerna](https://lerna.js.org/) to manage dependencies that are shared by
all connectors in this repository. Dependencies specific to this connector
should go in the connector's `package.json`. Dependencies shared by all
connectors, such as linting/formatting tools, should go in the root
`package.json`.
