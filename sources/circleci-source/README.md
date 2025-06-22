# CircleCI Source for Airbyte

📦 Docker Image: https://hub.docker.com/r/farosai/airbyte-circleci-source

Use this source to import [CircleCI](https://circleci) API data into Airbyte.

## Recommended Usage

A recommended approach if you'd like more detailed message delivery metrics is to enable the [CircleCI -> S3 data warehouse integration](https://circleci/docs/data-warehouse-sync/#s3-bucket), and then use the [S3 Airbyte source connector](https://docs.airbyte.io/integrations/sources/s3) to import the parquet files as needed.

This source is useful for importing CircleCI resource metadata (such as campaign or action names). The following CircleCI resources are currently available:

- `campaigns`
- `campaign_actions`
- `newsletters`

```shell
docker pull farosai/airbyte-circleci-source
docker run farosai/airbyte-circleci-source
```

## Local development

See [Common Development Instructions for Source Connectors](../README.md#common-development-instructions-for-source-connectors) for setting up your development environment.
