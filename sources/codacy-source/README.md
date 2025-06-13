# Codacy Source

Airbyte Source for [Codacy](https://www.codacy.com/).

## Configuration

| Field | Type | Description |
|-------|------|-------------|
| `api_token` | `string` | Codacy API Token for authentication |
| `organization` | `string` | Your Codacy organization name |
| `repositories` | `array` | List of repositories to sync. If empty, all repositories will be fetched |
| `cutoff_days` | `integer` | The number of days to look back for data (default: 90) |
| `start_date` | `string` | The start date to look back for data |
| `end_date` | `string` | The end date to look back for data |
| `api_timeout` | `integer` | Timeout in milliseconds for each request to the Codacy API (default: 60000) |
| `api_max_retries` | `integer` | The max number of retries before giving up on retrying requests to the Codacy API (default: 3) |

## Streams

| Stream | Description | Sync Mode |
|--------|-------------|-----------|
| `repositories` | Organization repositories | Full Refresh, Incremental |
| `issues` | Code quality issues by repository | Full Refresh, Incremental |
| `metrics` | Code quality metrics by repository | Full Refresh, Incremental |

## Authentication

This connector uses API token authentication. You can generate an API token in your Codacy account settings.

## Changelog

### 0.1.0
- Initial release with repositories, issues, and metrics streams
