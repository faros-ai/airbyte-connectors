# Faros Destination for Airbyte

Faros Destination is a universal destination to import data from any Airbyte source into Faros.

Each source stream is handled by an appropriate [Converter](https://github.com/faros-ai/airbyte-connectors/tree/main/destinations/airbyte-faros-destination/src/converters/converter.ts) implementation. Here are all the [supported sources](https://github.com/faros-ai/airbyte-connectors/tree/main/destinations/airbyte-faros-destination/src/converters).

Any additional source streams can be handled by providing a JSONata expression for the built-in [JSONataConverter](https://github.com/faros-ai/airbyte-connectors/tree/main/destinations/airbyte-faros-destination/src/converters/jsonata.ts) or by implementing converters for the streams ([read more below](#adding-support-for-additional-sources)).

## Usage

### Run from Airbyte

1. Open Airbyte UI
2. Go to Settings -> Destinations -> New Connector
3. Set image - `farosai/airbyte-faros-destination`
4. Set documentation - `https://github.com/faros-ai/airbyte-connectors`
5. Set the desired version `x.y.z`, e.g the latest [![](https://img.shields.io/docker/v/farosai/airbyte-faros-destination?color=blue&label=docker)](https://hub.docker.com/r/farosai/airbyte-faros-destination/tags)
6. Click Add

More details on how to add a custom connector can be found in the [official Airbyte guide](https://docs.airbyte.com/integrations/custom-connectors).

### Run from Terminal

```shell
docker pull farosai/airbyte-faros-destination
docker run farosai/airbyte-faros-destination
```

## Adding Support for Additional Sources

Faros Destination is built to be easily extensible to support additional sources by adding stream converters.

### Well-Known Sources

For well-known sources you can simply open a PR against this repository and add any new stream converters.
We are always happy for you to contribute them to the community.

When developing a converter, there is a specific naming convention that must be followed to ensure that the converter is correctly picked up by the Faros Destination. The converter class name must be the PascalCase (or UpperCamelCase) version of the stream name, e.g. [PullRequestStats](https://github.com/faros-ai/airbyte-connectors/tree/main/destinations/airbyte-faros-destination/src/converters/github/pull_request_stats.ts) for GitHub.

For testing, create the `all-streams.log` file and make sure that no real data is included. Also, ensure that the stream names are prefixed with the stream prefix specified in the test file. For example: `mytestsource__github__`.

We have implemented [a lot of converters](https://github.com/faros-ai/airbyte-connectors/tree/main/destinations/airbyte-faros-destination/src/converters) already so you have plenty examples to follow.

### Custom Sources

For custom or internal sources you can use Faros Destination as npm package in your project without having to fork or open PRs against this repo:
```
npm i airbyte-faros-destination
```

The library currently provides a main class `FarosDestinationRunner` which allows you to register the custom converters you created. Additionally, use the program property to get a default CLI app that provides the basic commands needed to write records to Faros.

Example `index.ts`:
```typescript
import {Command} from 'commander';
import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Converter, DestinationModel, DestinationRecord,FarosDestinationRunner,StreamContext} from 'airbyte-faros-destination'

class Builds extends Converter {
  source = 'CustomSource'
  destinationModels = ['cicd_Build'];

  id(record: AirbyteRecord): string {
    return record.record.data.id;
  }

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const build = record.record.data
    return [
      {
        model: 'cicd_Build',
        record: {
          uid: String(build.bid),
          startedAt: new Date(build.created_at),
          endedAt: new Date(build.finished_at),
          status: build.status,
          source: this.source
        },
      },
    ];
  }
}

class Pipelines extends Converter {
  // similar to the Builds in the example above
  ...
}

// Main entry point
export function mainCommand(): Command {
  const destinationRunner = new FarosDestinationRunner();

  // Register your custom converter(s)
  destinationRunner.registerConverters(
    new Builds(),
    new Pipelines()
  );
  return destinationRunner.program;
}
```

Example shell script to run file `bin/main`:
```shell
#!/usr/bin/env node

const {mainCommand} = require('../lib');

mainCommand().parseAsync(process.argv).catch((err) => {
  console.error(err.message);
  process.exit(1);
});
```

### Writing Records into Faros
```shell
./bin/main write --config config.json --catalog catalog.json
```

You will need to provide two parameters, a `config.json` which specifies the
details of the Faros destination to write to, and `catalog.json` to
document source streams to write records for.

Example `config.json`
```json
{
  "edition_configs": {
    "edition": "cloud",
    "api_url": "https://prod.api.faros.ai",
    "api_key": "<my_faros_api_key>",
    "graph": "default"
  },
  "origin": "mydatasource"
}
```
See [spec.json](https://github.com/faros-ai/airbyte-connectors/tree/main/destinations/airbyte-faros-destination/resources/spec.json) for more properties for the `config.json`

Example `catalog.json`
```json
{
  "streams": [
    {
      "stream": {
        "name": "mydatasource__CustomSource__builds"
      },
      "destination_sync_mode": "append"
    },
    {
      "stream": {
        "name": "mydatasource__CustomSource__pipelines"
      },
      "destination_sync_mode": "append"
    }
  ]
}
```

**Tip**: you can even pipe data directly from your custom source into your custom destination without Airbyte server while prefixing your streams (as expected by Faros Destination):
```shell
<my-source-command> | jq -c -R 'fromjson? | select(.type == "RECORD") | .record.stream = "mydatasource__CustomSource__\(.record.stream)"' | <my-destination-command>
```

### Additional Commands
Run `./bin/main --help` for detailed information on available commands.
