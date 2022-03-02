# DataDog Source

This source streams data from the [DataDog APIs](https://docs.datadoghq.com/api/latest/) using the [DataDog Node.js API client](https://www.npmjs.com/package/@datadog/datadog-api-client).

## Streams

| Model | Full | Incremental |
|---|---|---|
| Incidents  | ✅ | ✅ |
| Users  | ✅ | ✅ |

## Testing

From the DataDog source directory execute:

```sh
$ npm t
```

From the repo root directory execute:

```sh
$ ./scripts/source-acceptance-test.sh datadog-source
```
