# Developing an Airbyte Source

## Requirements

- NodeJS >= 22.x
- Docker
- [Turborepo](https://turbo.build/) -- Install by running `npm install turbo --global`

## Helpful Documentation

The [Airbyte Specification
doc](https://docs.airbyte.com/connector-development/#the-airbyte-specification)
describes each step of an Airbyte Source in detail. Also read [Airbyte's
development
guide](https://docs.airbyte.com/connector-development#adding-a-new-connector).
This repository will automatically release the sources as Docker images via
Github Actions.

## Development

### 1: Create source subproject

Clone the repo and copy the `sources/example-source` folder into a new folder
with the name of your new source. In this guide we will name our source
`new-source`, so we will create `sources/new-source`. In your new folder, update
`package.json` and the ExampleSource class in `src/index.ts` with the name of
your source.

Go back to the root folder of the repo and run `npm i` to
install the dependencies for all the sources, including our `new-source`.

### 2: Implement Spec command

The first step of a source is returning specification of the configuration
parameters required to connect to the targeted system (e.g. API credentials,
URLs, etc). The provided Source class does this by returning the JSON-Schema
object in `resources/spec.json`. Update this file with your source's
configuration parameters, making sure to protect any sensitive parameters by
setting `"airbyte_secret": true` in their corresponding properties.

See this [guide](https://github.com/airbytehq/airbyte/blob/master/airbyte-webapp/docs/HowTo-ConnectionSpecification.md)
on how to preview the Airbyte UI elements generated from the specification.

### 3: Implement Check command

After the configuration parameters are populated by the user, the source
verifies that the provided configuration is usable. This is done via the
`checkConnection` method in your source class. The `config` argument is a
dictionary of the parameters provided by the user. This method should verify
that all credentials in the configuration are valid, URLs are correct and
reachable, values are within proper ranges, etc.

The method returns a tuple of `[boolean, error]`, where the boolean indicates
whether or not the configuration is valid, and the error is an optional
[VError](https://github.com/joyent/node-verror) indicating what is invalid about
the configuration. If the boolean is true, the error should be undefined.

### 4: Implement Streams

A source contains one or more streams, which correspond to entity types of the
system your source is fetching data from. For example, a GitHub source would
have streams for users, commits, pull requests, etc. Each stream also has its
own arbitrary state for supporting incremental mode syncs. Implement your
streams, an example of which is in the `Builds` class in `src/stream.ts`,
and include them in your source via the `streams()` method of your source class.

Each stream has a JSON-Schema object defining the schema of the records that
this stream will fetch. This is done in the streams' `getJsonSchema()` method.
The source combines the results of calling this method on every stream to
create the Airbyte Catalog for the source's `discover` command.
Tip: use [json-to-schema-converter](https://www.liquid-technologies.com/online-json-to-schema-converter) to help with generate the JSON-Schema files for your streams.

The `primaryKey` property defines one or more fields of the record schema that
make up the unique key of each record.

The `cursorField` property defines one or more fields of the record schema that
Airbyte will check to determine whether a record is new or updated. This is
required to support syncing in incremental mode, and all our sources should
support incremental mode unless the data from source's technical system doesn't
have any timestamp-like fields that describe the freshness of each record.

The `readRecords()` method defines the logic for fetching data from your
source's technical system.

The `getUpdatedState()` method defines how to update the stream's arbitrary
state, given the current stream state and the most recent record generated from
`readRecords()`. The source calls this method after each record is generated.

The `stateCheckpointInterval` property determines how often a state message is
outputted and persisted. For example, if the interval is 100, the stream's state
will be persisted after reading every 100 records. It is undefined by default,
meaning the state is only persisted after all streams in the source have
finished reading records. Alternatively, you can implement [Stream
Slicing](https://docs.airbyte.com/connector-development/cdk-python/stream-slices)
by overriding the `streamSlices()` method, but for most cases, setting a
checkpoint interval should be sufficient.

## Common Development Instructions

The following sections contain common instructions that apply to all source connectors. Individual source READMEs should reference these sections instead of duplicating this information.

### Local Development

#### Build Connector

From the root repository directory (NOT the individual source folder), run:

```bash
npm run prepare
```

This will install all required dependencies and build all included connectors.

After making code changes to a specific connector, navigate to that connector's directory and run:

```bash
npm run build
```

#### Create Credentials

1. Create a file `secrets/config.json` conforming to your source's `resources/spec.json` file.

**Note:** Any directory named `secrets` is gitignored across the entire repository, so there is no danger of accidentally checking in sensitive information.

2. See `test_files/config.json` in your source directory for a sample config file.

### Running the Connector

#### Locally Running the Connector

From your source connector directory, run:

```bash
# Check the spec
bin/main spec

# Test the connection
bin/main check --config secrets/config.json

# Discover the schema
bin/main discover --config secrets/config.json

# Read data
bin/main read --config secrets/config.json --catalog test_files/full_configured_catalog.json
```

#### Running the Connector Docker Image

##### Build the Docker Image

From the root repository directory, build the Docker image:

```bash
docker build . --build-arg path=sources/[source-name]-source --build-arg version=0.0.1 -t [source-name]-source
```

Replace `[source-name]` with your actual source name.

##### Run Docker Commands

From your source connector directory, run any of the connector commands:

```bash
# Check the spec
docker run --rm [source-name]-source spec

# Test the connection
docker run --rm -v $(pwd)/secrets:/secrets [source-name]-source check --config /secrets/config.json

# Discover the schema
docker run --rm -v $(pwd)/secrets:/secrets [source-name]-source discover --config /secrets/config.json

# Read data
docker run --rm -v $(pwd)/secrets:/secrets -v $(pwd)/test_files:/test_files [source-name]-source read --config /secrets/config.json --catalog /test_files/full_configured_catalog.json
```

### Unit Testing

To run unit tests locally, from your source connector directory run:

```bash
npm test
```

### Common Project Structure

Each source connector typically follows this structure:

```
[source-name]-source/
├── bin/
│   └── main           # Entry point script
├── resources/
│   └── spec.json      # Connector specification
├── src/
│   ├── index.ts       # Main connector implementation
│   └── tsconfig.json  # TypeScript configuration
├── test/
│   └── index.test.ts  # Unit tests
├── test_files/        # Test fixtures and sample data
├── package.json       # Dependencies and scripts
└── README.md          # Source-specific documentation
```

### Development Guidelines

1. **TypeScript**: All connectors are written in TypeScript
2. **Testing**: Write comprehensive unit tests for your connector logic
3. **Documentation**: Update the README with source-specific information only
4. **Secrets**: Never commit credentials or sensitive information
5. **Spec**: Keep `resources/spec.json` up to date with configuration requirements

### Troubleshooting

#### Common Issues

1. **Build Failures**: Ensure you've run `npm run prepare` from the root directory first
2. **Type Errors**: Check that your TypeScript version matches the project requirements
3. **Connection Failures**: Verify your credentials and network connectivity
4. **Docker Issues**: Ensure Docker is running and you have sufficient permissions

### Source-Specific README Guidelines

When creating a README for a new source, include only:

1. Brief description of the source
2. Link to detailed Airbyte documentation (if applicable)
3. Any source-specific prerequisites or setup steps
4. Unique configuration examples
5. List of supported streams
6. Any special permissions or access requirements
7. Known limitations or considerations

Reference this common README section for all standard procedures to avoid duplication.
