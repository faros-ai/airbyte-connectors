# Faros Destination for Airbyte

Use this a universal destination to import data from an Airbyte source into Faros.
Here are all the [supported sources](https://github.com/faros-ai/airbyte-connectors/tree/main/destinations/faros-destination/src/converters).

## Add to Airbyte

1. Open Airbyte UI
2. Go to Settings -> Destinations -> New Connector
3. Set image - `farosai/airbyte-faros-destination`
4. Set documentation - `https://github.com/faros-ai/airbyte-connectors`
5. Set the desired version `x.y.z`, e.g the latest [![](https://img.shields.io/github/v/tag/faros-ai/airbyte-connectors?label=)](https://hub.docker.com/r/farosai/airbyte-faros-destination/tags)
6. Click Add

More details on how to add a custom connector can be found [here](https://docs.airbyte.com/integrations/custom-connectors).

## Run from Terminal

```shell
docker pull farosai/airbyte-faros-destination
docker run farosai/airbyte-faros-destination
```
