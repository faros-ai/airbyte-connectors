# Datadog Source

This source streams data from the [Datadog APIs](https://docs.datadoghq.com/api/latest/) using the [Datadog Node.js API client](https://www.npmjs.com/package/@datadog/datadog-api-client).

## Streams

| Model     | Full | Incremental |
|-----------|---|---|
| Incidents | ✅ | ✅ |
| Metrics   | ✅ | ✅ |
| Users     | ✅ | ✅ |

## Testing

From the Datadog source directory execute:

```sh
$ npm t
```

From the repo root directory execute:

```sh
$ ./scripts/source-acceptance-test.sh datadog-source
```
