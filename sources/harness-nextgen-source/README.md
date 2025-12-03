# Harness NextGen Source

This is the Airbyte source connector for the Harness NextGen platform. It extracts data from the Harness NextGen REST API, including organizations, projects, pipelines, services, environments, and pipeline executions.

## Configuration

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `api_key` | Yes | - | Harness API Key for authentication |
| `account_id` | Yes | - | Harness Account ID |
| `api_url` | No | `https://app.harness.io` | The API URL for fetching data from Harness NextGen |
| `organization_ids` | No | - | Optional list of organization identifiers to filter |
| `project_ids` | No | - | Optional list of project identifiers to filter |
| `cutoff_days` | Yes | 90 | Only fetch executions updated after cutoff |
| `page_size` | No | 100 | Number of records to fetch per API call (max 100) |
| `deployment_timeout` | No | 24 | Max hours to consider for a deployment to be running/queued |

## Streams

| Stream | Sync Mode | Description |
|--------|-----------|-------------|
| `organizations` | Full Refresh | Harness organizations in the account |
| `projects` | Full Refresh | Projects within organizations |
| `pipelines` | Full Refresh | Pipeline definitions within projects |
| `services` | Full Refresh | Service definitions within projects |
| `environments` | Full Refresh | Environment definitions within projects |
| `executions` | Incremental | Pipeline execution records |

## Authentication

This connector uses API Key authentication. To generate an API key:

1. Go to the Harness Platform
2. Navigate to **My Profile** > **API Keys**
3. Click **+ API Key** and create a new key
4. Click **+ Token** within the API Key tile to generate a token
5. Save the token securely - it won't be shown again

## Differences from Harness (v1) Source

This connector targets the Harness NextGen platform, which uses a different API and data model than the original Harness FirstGen platform:

- **API**: REST API instead of GraphQL
- **Hierarchy**: Account → Organization → Project → Pipeline (vs Account → Application)
- **More streams**: Separate streams for organizations, projects, services, environments
- **Richer execution data**: More detailed pipeline execution information including stage counts, trigger info, and module-specific data
