# Vanta Source

This is the repository for the Vanta source connector, written in Typescript.
The source is currently primarily used to get vulnerabilities.
Within the config, the option 'queryTypes' defines which queries will be used
to fetch vulnerabilities from Vanta.
* gitv2 maps to resources/GithubDependabotVulnerabilityV2List.gql
* awsv2 maps to resources/AwsContainerVulnerabilityV2List.gql
When queryTypes contains all three ("gitv2", "awsv2"), then all
three queries are called and sent to the destination.

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
including the Vanta source connector.

Now you can cd into the Vanta connector directory, `sources/vanta-source`,
and iterate on the Vanta source connector. After making code changes, run:

```
npm run build
```

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
docker build . --build-arg path=sources/vanta-source --build-arg version=0.0.1 -t vanta-source
```

#### Run

Then return to the Vanta connector directory and run any of the connector
commands as follows:

```
docker run --rm vanta-source spec
docker run --rm -v $(pwd)/secrets:/secrets vanta-source check --config /secrets/config.json
docker run --rm -v $(pwd)/secrets:/secrets vanta-source discover --config /secrets/config.json
docker run --rm -v $(pwd)/secrets:/secrets -v $(pwd)/test_files:/test_files vanta-source read --config /secrets/config.json --catalog /test_files/full_configured_catalog.json
```

## Testing

### Unit Tests

To run unit tests locally, from the Vanta connector directory run:

```
npm run build;
npm run test;
```
