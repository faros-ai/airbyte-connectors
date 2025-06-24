# Datadog Source

This source streams data from the [Datadog APIs](https://docs.datadoghq.com/api/latest/) using the [Datadog Node.js API client](https://www.npmjs.com/package/@datadog/datadog-api-client).

For common build, test, and run instructions, see the [common source documentation](../README.md#common-development-instructions).

## Streams

| Model     | Full | Incremental | Required Permissions |
|-----------|---|---|---|
| Incidents | ✅ | ✅ | incident_read |
| Metrics   | ✅ | ✅ | timeseries_query |
| SLOs      | ✅ | ✅ | slos_read |
| Users     | ✅ | ✅ | user_access_read  |