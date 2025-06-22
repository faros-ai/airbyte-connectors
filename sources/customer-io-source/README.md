# Customer.io Source for Airbyte

📦 Docker Image: https://hub.docker.com/r/farosai/airbyte-customer-io-source

Use this source to import [Customer.io](https://customer.io) API data into Airbyte.

## Recommended Usage

A recommended approach if you'd like more detailed message delivery metrics is to enable the [Customer.io -> S3 data warehouse integration](https://customer.io/docs/data-warehouse-sync/#s3-bucket), and then use the [S3 Airbyte source connector](https://docs.airbyte.io/integrations/sources/s3) to import the parquet files as needed.

This source is useful for importing Customer.io resource metadata (such as campaign or action names). The following Customer.io resources are currently available:

- `campaigns`
- `campaign_actions`
- `newsletters`

```shell
docker pull farosai/airbyte-customer-io-source
docker run farosai/airbyte-customer-io-source
```

## Local development

See [Common Development Instructions for Source Connectors](../README.md#common-development-instructions-for-source-connectors) for setting up your development environment.
