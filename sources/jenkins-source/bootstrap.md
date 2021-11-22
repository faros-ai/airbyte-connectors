## Streams

Jenkins is a REST API. This connector has the following streams:

* [Builds](https://your.jenkins.url/job/$JOB_NAME/$BUILD_NUMBER/api/json?pretty=true) \(Incremental\)
* [Jobs](https://your.jenkins.url/job/$JOB_NAME/api/json?pretty=true)

In the above links, replace `your.jenkins.url` with the url of your Jenkins
instance, and replace any environment variables with an existing Jenkins job or
build id.

See [https://your.jenkins.url/api](https://your.jenkins.url/api) for API
documentation.

## Testing

A live Jenkins Server is required to run the Source Acceptance Tests. An example
of how to do this is in [our Github Actions
Workflow](https://github.com/faros-ai/airbyte-connectors/blob/main/.github/workflows/ci.yml#L54).
