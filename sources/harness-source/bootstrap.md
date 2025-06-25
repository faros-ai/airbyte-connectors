## Streams

Harness is a GraphQL API. This connector has the following streams:

* [Executions](https://docs.harness.io/article/ba4vs50071-use-workflows-api) \(Incremental\)
* [Repositories](https://apidocs.harness.io/tag/Repositories) \(Incremental\)

See [here](https://docs.harness.io/article/tm0w6rruqv-harness-api) for API
documentation. While Harness has both REST and GraphQL APIs, this connector only
uses the GraphQL API. This might change as additional streams are added to the
connector.

The Execution stream pulls executions from both Harness Pipelines and Workflows.
The Repositories stream pulls repository data from Harness code repositories.
