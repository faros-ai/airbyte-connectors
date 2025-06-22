# Datadog Source

This source streams data from the [Datadog APIs](https://docs.datadoghq.com/api/latest/) using the [Datadog Node.js API client](https://www.npmjs.com/package/@datadog/datadog-api-client).

See [Common Development Instructions for Source Connectors](../README.md#common-development-instructions-for-source-connectors) for setting up your development environment.

## Streams

| Model     | Full | Incremental | Required Permissions |
|-----------|---|---|---|
| Incidents | ✅ | ✅ | incident_read |
| Metrics   | ✅ | ✅ | timeseries_query |
| SLOs      | ✅ | ✅ | slos_read |
| Users     | ✅ | ✅ | user_access_read  |

## Testing

From the Datadog source directory execute:

```sh
$ npm t
```

From the repo root directory execute:

```sh
$ ./scripts/source-acceptance-test.sh datadog-source
```
