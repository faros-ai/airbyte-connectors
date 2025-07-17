# Office 365 Calendar Source Connector

A high-performance Airbyte source connector for syncing calendar and event data from Microsoft Office 365 (Microsoft Graph API) to Faros destinations.

## Overview

This connector enables you to extract calendar and event data from Office 365 calendars using Microsoft Graph API. It supports both full refresh and incremental sync modes, with advanced features like selective calendar filtering, domain-wide delegation, and intelligent error handling.

### Key Features

- **Microsoft Graph API Integration**: Uses official Microsoft Graph SDK for reliable, type-safe API access
- **Incremental Sync**: Efficient delta queries to sync only changed events since last run
- **Selective Calendar Access**: Configure specific calendar IDs or sync all accessible calendars
- **Domain-Wide Delegation**: Support for organization-wide calendar access with proper permissions
- **Type Safety**: Built with comprehensive TypeScript types and functional programming patterns
- **Error Resilience**: Advanced error handling with automatic retries and graceful degradation
- **Performance Optimized**: Request batching, pagination, and memory-efficient streaming

## Supported Sync Modes

| Stream | Full Refresh | Incremental |
|--------|-------------|-------------|
| Calendars | ✅ | ❌ |
| Events | ✅ | ✅ |

## Data Schema

### Calendars Stream

Extracts calendar metadata including names, owners, permissions, and sharing settings.

**Schema**: Compatible with Google Calendar schema for seamless migration
- `id`: Unique calendar identifier
- `summary`: Calendar name/title
- `description`: Calendar description
- `time_zone`: Calendar timezone
- `access_role`: User's access level to the calendar
- `primary`: Whether this is the user's primary calendar

### Events Stream

Extracts detailed event information including attendees, recurrence, and meeting details.

**Schema**: Compatible with Google Calendar schema with Office 365 extensions
- `id`: Unique event identifier
- `summary`: Event title/subject
- `description`: Event description/body
- `start`: Event start time with timezone
- `end`: Event end time with timezone
- `location`: Event location information
- `attendees`: List of event attendees with response status
- `organizer`: Event organizer details
- `status`: Event status (confirmed, tentative, cancelled)
- `visibility`: Event visibility (public, private, confidential)
- `recurrence`: Recurrence pattern for recurring events
- `updated`: Last modified timestamp

## Configuration

### Required Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `client_id` | string | Azure App Registration Client ID |
| `client_secret` | string | Azure App Registration Client Secret |
| `tenant_id` | string | Azure AD Tenant ID (GUID or domain) |

### Optional Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `calendar_ids` | array | null | Specific calendar IDs to sync (sync all if not specified) |
| `domain_wide_delegation` | boolean | false | Enable organization-wide calendar access |
| `events_max_results` | integer | 2500 | Maximum events per API request |
| `cutoff_days` | integer | 365 | Days to look back for events (1-3650) |

### Example Configuration

```json
{
  "client_id": "12345678-1234-1234-1234-123456789012",
  "client_secret": "your-client-secret-here",
  "tenant_id": "your-tenant-id-here",
  "calendar_ids": [
    "AAMkAGVmMDEzMTM4LTZmYWUtNDdkNC1hMDZiLTU1OGY5OTZhYmY4OABGAAAAAAAiQ8W967B7TKBjgx9rVEURBwAiIsqMbYjsT5e-T7KzowPTAAAAAAEGAAAiIsqMbYjsT5e-T7KzowPTAAABFmfNAAA="
  ],
  "domain_wide_delegation": false,
  "events_max_results": 1000,
  "cutoff_days": 180
}
```

## Prerequisites

### Azure App Registration

1. **Register Application** in Azure Portal ([portal.azure.com](https://portal.azure.com))
   - Navigate to Azure Active Directory > App registrations
   - Click "New registration"
   - Provide application name and select account types
   - Set redirect URI (not required for this connector)

2. **Generate Client Secret**
   - In your app registration, go to "Certificates & secrets"
   - Click "New client secret"
   - Copy the secret value (this is your `client_secret`)

3. **Configure API Permissions**
   - Go to "API permissions" in your app registration
   - Click "Add a permission" > Microsoft Graph > Application permissions
   - Add required permissions (see below)
   - Click "Grant admin consent" for your organization

### Required Microsoft Graph Permissions

**Minimum Permissions (User Calendar Access)**:
- `Calendars.Read`: Read user calendars
- `User.Read`: Read basic user profile

**Extended Permissions (Organization-Wide Access)**:
- `Calendars.Read.All`: Read all organization calendars
- `User.Read.All`: Read all user profiles
- `Directory.Read.All`: Read directory data

### Domain-Wide Delegation Setup

For organization-wide calendar access:

1. **Enable Domain-Wide Delegation** in Azure portal
2. **Configure OAuth Scopes** for the application
3. **Grant Admin Consent** for the required permissions
4. **Set `domain_wide_delegation: true`** in connector configuration

## Installation

### Install Dependencies
```bash
npm install
```

### Build Connector
```bash
npm run build
```

### Run Tests
```bash
npm test
```

## Usage

### Discovery
Discover available streams and their schemas:
```bash
node lib/index.js discover --config config.json
```

### Connection Check
Verify configuration and connectivity:
```bash
node lib/index.js check --config config.json
```

### Full Refresh Sync
Extract all calendar and event data:
```bash
node lib/index.js read --config config.json --catalog catalog.json
```

### Incremental Sync
Extract only changed data since last sync:
```bash
node lib/index.js read --config config.json --catalog catalog.json --state state.json
```

## Performance Considerations

### Recommended Settings

- **Small Organizations (< 100 users)**: Default settings work well
- **Medium Organizations (100-1000 users)**: Set `events_max_results: 1000`, `cutoff_days: 180`
- **Large Organizations (1000+ users)**: Set `events_max_results: 500`, `cutoff_days: 90`, use specific `calendar_ids`

### Memory Usage

The connector is optimized for memory efficiency:
- **Streaming**: Events are processed in batches to minimize memory usage
- **Pagination**: Large datasets are automatically paginated
- **Incremental Sync**: Only changed events are processed, reducing memory footprint

### Rate Limiting

Microsoft Graph API has rate limits:
- **Default**: 10,000 requests per 10 minutes per application
- **Connector Behavior**: Automatically handles rate limiting with exponential backoff
- **Best Practice**: Use incremental sync for large datasets

## Error Handling

The connector includes comprehensive error handling:

### Authentication Errors
- **Invalid Credentials**: Clear error messages with remediation steps
- **Insufficient Permissions**: Specific permission requirements listed
- **Token Expiration**: Automatic token refresh and retry

### API Errors
- **Rate Limiting**: Automatic backoff and retry with exponential delay
- **Network Issues**: Configurable retry logic with timeout handling
- **Service Unavailable**: Graceful degradation and detailed error reporting

### Data Errors
- **Malformed Events**: Skip invalid events with detailed logging
- **Missing Calendars**: Continue processing available calendars
- **Permission Denied**: Log inaccessible calendars, continue with accessible ones

## Integration with Faros

### Compatible Converters

This connector produces data compatible with existing Google Calendar converters:
- `destinations/airbyte-faros-destination/src/converters/googlecalendar/calendars.ts`
- `destinations/airbyte-faros-destination/src/converters/googlecalendar/events.ts`

### Dashboard Compatibility

Office 365 calendar data integrates seamlessly with Faros dashboards:
- **Calendar Utilization**: Meeting density and time allocation metrics
- **Team Collaboration**: Cross-team meeting patterns and frequency
- **Focus Time Analysis**: Available time blocks and meeting-free periods
- **Meeting Analytics**: Duration, frequency, and participant analysis

### Data Model

The connector maps Office 365 data to the standard Faros calendar data model:
- **Consistent Schema**: Same field names and types as Google Calendar
- **Extended Metadata**: Additional Office 365-specific fields when available
- **Time Zone Handling**: Proper timezone conversion and storage

## Comparison with Google Calendar Connector

| Feature | Google Calendar | Office 365 Calendar |
|---------|----------------|---------------------|
| Full Refresh | ✅ | ✅ |
| Incremental Sync | ✅ | ✅ |
| Calendar Filtering | ✅ | ✅ |
| Domain-Wide Access | ✅ | ✅ |
| Attendee Information | ✅ | ✅ |
| Recurrence Patterns | ✅ | ✅ |
| Meeting Locations | ✅ | ✅ |
| Teams Integration | ❌ | ✅ |
| Sensitivity Labels | ❌ | ✅ |

## Contributing

### Development Setup

1. **Clone Repository**
2. **Install Dependencies**: `npm install`
3. **Run Tests**: `npm test`
4. **Build**: `npm run build`
5. **Lint**: `npm run lint`

### Code Quality Standards

- **TypeScript Strict Mode**: All code uses strict TypeScript settings
- **Test Coverage**: Minimum 95% line coverage required
- **Functional Programming**: Immutable data structures and functional composition
- **Error Handling**: Comprehensive error handling with typed exceptions
- **Documentation**: Complete JSDoc documentation for all public APIs

### Testing

The connector includes comprehensive test coverage:
- **Unit Tests**: Individual component testing
- **Integration Tests**: End-to-end API testing with mocks
- **Property-Based Tests**: Mathematical correctness verification
- **Performance Tests**: Memory usage and timing validation

## License

Apache License 2.0 - see LICENSE file for details.

## Support

For issues and questions:
1. **Check Troubleshooting Guide**: See TROUBLESHOOTING.md
2. **Review Configuration**: Verify Azure AD setup in SETUP.md
3. **Report Issues**: Create issue in project repository
4. **Contact Support**: Reach out through Faros support channels

## Changelog

### v0.0.1
- Initial release with full Office 365 Calendar integration
- Support for calendars and events streams
- Incremental sync with delta queries
- Microsoft Graph SDK integration
- Type-safe functional programming architecture