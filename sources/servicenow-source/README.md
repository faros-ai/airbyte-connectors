# ServiceNow Source

This source streams data from the [ServiceNow GraphQL API](https://docs.servicenow.com/bundle/sandiego-application-development/page/integrate/graphql/task/query-schema-from-component.html)

## Streams

| Model | Full | Incremental |
|---|---|---|
| Incidents  | ✅ | ✅ |
| Users  | ✅ | ✅ |

## Testing

From the ServiceNow source directory execute:

```sh
$ npm t
```

From the repo root directory execute:

```sh
$ ./scripts/source-acceptance-test.sh servicenow-source
```
