# Faros Feeds source for Airbyte

Universal Airbyte source adapting the Faros Feeds. Run any Faros feed as an Airbyte source.

# Running locally

```sh
FEEDS_ROOT="<absolute path to feeds folder, e.g '/Users/mt/faros/feeds/feeds'>" \
./bin/main read \
  --config "<cfg file conforming to the spec, e.g 'test/resources/github.json'>" \
  --catalog "<catalog file, e.g 'test_files/full_configured_catalog.json'>"
```

For example:

```sh
FEEDS_ROOT="/Users/mt/dev/faros/feeds/feeds" \
./bin/main read \
  --config "test/resources/github.json" \
  --catalog "test_files/full_configured_catalog.json"
```

# Building the Docker image

Run the command below, from the repository root folder:

```sh
docker build . -f faros-feeds-source/Dockerfile -t faros-ai/airbyte-faros-feeds-source
```
