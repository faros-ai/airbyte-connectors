# GitHub Source

This is the repository for the Github source connector, written in Typescript.

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
including the Github source connector.

Now you can cd into the Github connector directory, `sources/github-source`,
and iterate on the Github source connector. After making code changes, run:

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

Then return to the Github connector directory and run any of the connector
commands as follows:

```
docker run --rm github-source spec
docker run --rm -v $(pwd)/secrets:/secrets github-source check --config /secrets/config.json
docker run --rm -v $(pwd)/secrets:/secrets github-source discover --config /secrets/config.json
docker run --rm -v $(pwd)/secrets:/secrets -v $(pwd)/test_files:/test_files github-source read --config /secrets/config.json --catalog /test_files/full_configured_catalog.json
```

## Testing

### Unit Tests

To run unit tests locally, from the Github connector directory run:

```
npm test
```

## Dependency Management

We use [lerna](https://lerna.js.org/) to manage dependencies that are shared by
all connectors in this repository. Dependencies specific to this connector
should go in the connector's `package.json`. Dependencies shared by all
connectors, such as linting/formatting tools, should go in the root
`package.json`.

### GitHub Required Permissions per Stream

| Stream  | Classic               | Fine-grained*                             |
|---------|-----------------------|-------------------------------------------|
| Commits | repo:status, read:org | Repository Contents, Repository Metadata  |
|         |                       |                                           |

*Fine-grained permissions marked as required are always read-only.