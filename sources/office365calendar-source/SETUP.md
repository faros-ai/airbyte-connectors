# Office 365 Calendar Connector Setup Guide

This guide provides step-by-step instructions for configuring Azure Active Directory and setting up the Office 365 Calendar connector.

## Table of Contents

1. [Azure App Registration](#azure-app-registration)
2. [API Permissions Configuration](#api-permissions-configuration)
3. [Client Secret Generation](#client-secret-generation)
4. [Domain-Wide Delegation Setup](#domain-wide-delegation-setup)
5. [Connector Configuration](#connector-configuration)
6. [Testing and Validation](#testing-and-validation)
7. [Security Best Practices](#security-best-practices)
8. [Common Issues](#common-issues)

## Azure App Registration

### Step 1: Access Azure Portal

1. Open [Azure Portal](https://portal.azure.com)
2. Sign in with an account that has admin privileges in your Azure AD tenant
3. Navigate to **Azure Active Directory** from the left sidebar

### Step 2: Create App Registration

1. In Azure AD, click **App registrations** from the left menu
2. Click **New registration** at the top
3. Fill in the registration form:
   - **Name**: `Faros Office 365 Calendar Connector` (or your preferred name)
   - **Supported account types**: Select based on your needs:
     - **Single tenant**: Only your organization (recommended for most cases)
     - **Multi-tenant**: Multiple organizations (if you need cross-tenant access)
   - **Redirect URI**: Leave blank (not required for this connector)
4. Click **Register**

### Step 3: Note Important IDs

After registration, you'll see the app overview page. **Copy and save** these values:

- **Application (client) ID**: This is your `client_id`
- **Directory (tenant) ID**: This is your `tenant_id`

## API Permissions Configuration

### Step 4: Add Microsoft Graph Permissions

1. In your app registration, click **API permissions** from the left menu
2. Click **Add a permission**
3. Select **Microsoft Graph**
4. Choose **Application permissions** (not Delegated permissions)

### Required Permissions by Use Case

#### Basic Calendar Access (Single User)
Add these permissions:
- `Calendars.Read`: Read user calendars
- `User.Read`: Read basic user profile

#### Organization-Wide Access (All Users)
Add these permissions:
- `Calendars.Read.All`: Read all organization calendars
- `User.Read.All`: Read all user profiles
- `Directory.Read.All`: Read directory data (for user lookup)

#### Domain-Wide Delegation (Advanced)
Add these permissions:
- `Calendars.Read.All`: Read all organization calendars
- `User.Read.All`: Read all user profiles
- `Directory.Read.All`: Read directory data
- `Application.Read.All`: Read application data (if needed)

### Step 5: Grant Admin Consent

**CRITICAL**: After adding permissions, you must grant admin consent:

1. Click **Grant admin consent for [Your Organization]**
2. Click **Yes** in the confirmation dialog
3. Verify all permissions show **Granted for [Your Organization]** with green checkmarks

> **Note**: Without admin consent, the connector will fail with permission errors.

## Client Secret Generation

### Step 6: Create Client Secret

1. In your app registration, click **Certificates & secrets** from the left menu
2. Click **New client secret**
3. Provide a description: `Faros Connector Secret`
4. Select expiration period:
   - **6 months**: For testing environments
   - **12 months**: For short-term production use
   - **24 months**: For long-term production use (maximum)
5. Click **Add**

### Step 7: Copy Secret Value

**IMPORTANT**: Copy the secret **Value** immediately - it will only be shown once!

- **Secret Value**: This is your `client_secret`
- **Secret ID**: Not needed for the connector

> **Security Note**: Store the client secret securely. If lost, you'll need to generate a new one.

## Domain-Wide Delegation Setup

Domain-wide delegation allows the connector to access calendars for all users in your organization without individual user consent.

### Step 8: Enable Domain-Wide Delegation (Optional)

1. In your app registration, go to **Manifest** from the left menu
2. Find the `"oauth2AllowIdTokenImplicitFlow"` setting
3. Ensure these settings are configured:
   ```json
   {
     "oauth2AllowIdTokenImplicitFlow": false,
     "oauth2AllowImplicitFlow": false,
     "oauth2Permissions": []
   }
   ```
4. Click **Save**

### Step 9: Configure Organization Policies

Contact your Azure AD administrator to:

1. **Verify App Permissions**: Ensure the app has appropriate organization-wide permissions
2. **Configure Conditional Access**: Set up any required conditional access policies
3. **Enable Service Principal**: Verify the service principal is enabled for your tenant

## Connector Configuration

### Step 10: Create Configuration File

Create a `config.json` file with your Azure AD details:

```json
{
  "client_id": "12345678-1234-1234-1234-123456789012",
  "client_secret": "your-client-secret-here",
  "tenant_id": "your-tenant-id-here",
  "domain_wide_delegation": false,
  "events_max_results": 2500,
  "cutoff_days": 365
}
```

### Configuration Parameters Explained

| Parameter | Required | Description | Example |
|-----------|----------|-------------|---------|
| `client_id` | ✅ | Application (client) ID from Azure | `12345678-1234-...` |
| `client_secret` | ✅ | Client secret value | `abc123...` |
| `tenant_id` | ✅ | Directory (tenant) ID | `87654321-4321-...` |
| `calendar_ids` | ❌ | Specific calendar IDs to sync | `["calendar1", "calendar2"]` |
| `domain_wide_delegation` | ❌ | Enable org-wide access | `true` or `false` |
| `events_max_results` | ❌ | Max events per request | `1000` (1-10000) |
| `cutoff_days` | ❌ | Days to look back | `180` (1-3650) |

### Advanced Configuration Examples

#### Single User Access
```json
{
  "client_id": "your-client-id",
  "client_secret": "your-client-secret",
  "tenant_id": "your-tenant-id",
  "domain_wide_delegation": false,
  "cutoff_days": 90
}
```

#### Organization-Wide Access
```json
{
  "client_id": "your-client-id",
  "client_secret": "your-client-secret",
  "tenant_id": "your-tenant-id",
  "domain_wide_delegation": true,
  "events_max_results": 1000,
  "cutoff_days": 180
}
```

#### Specific Calendars Only
```json
{
  "client_id": "your-client-id",
  "client_secret": "your-client-secret",
  "tenant_id": "your-tenant-id",
  "calendar_ids": [
    "AAMkAGVmMDEzMTM4LTZmYWUtNDdkNC1hMDZiLTU1OGY5OTZhYmY4OABGAAAAAAAiQ8W967B7TKBjgx9rVEURBwAiIsqMbYjsT5e-T7KzowPTAAAAAAEGAAAiIsqMbYjsT5e-T7KzowPTAAABFmfNAAA="
  ],
  "cutoff_days": 365
}
```

## Testing and Validation

### Step 11: Test Connection

Run the connection check to verify your setup:

```bash
node lib/index.js check --config config.json
```

Expected successful output:
```json
{
  "type": "CONNECTION_STATUS",
  "connectionStatus": {
    "status": "SUCCEEDED"
  }
}
```

### Step 12: Discover Streams

Verify the connector can discover available streams:

```bash
node lib/index.js discover --config config.json
```

Expected output should include `calendars` and `events` streams.

### Step 13: Test Data Extraction

Run a small test sync:

```bash
node lib/index.js read --config config.json --catalog catalog.json | head -20
```

This should output calendar and event records in JSON format.

## Security Best Practices

### Application Security

1. **Principle of Least Privilege**: Only grant the minimum required permissions
2. **Regular Secret Rotation**: Rotate client secrets every 6-12 months
3. **Monitor App Usage**: Review Azure AD sign-in logs for unusual activity
4. **Secure Storage**: Store client secrets in secure credential management systems

### Network Security

1. **IP Restrictions**: Configure conditional access policies to restrict IP ranges
2. **Device Compliance**: Require compliant devices for admin operations
3. **MFA Requirements**: Enforce multi-factor authentication for admin accounts

### Data Privacy

1. **Data Minimization**: Only sync necessary calendar data
2. **Calendar Filtering**: Use specific calendar IDs to limit data exposure
3. **Retention Policies**: Implement appropriate data retention in your destination
4. **Audit Logging**: Enable detailed logging for compliance requirements

### Compliance Considerations

- **GDPR**: Ensure proper consent and data handling for EU users
- **HIPAA**: Additional safeguards may be needed for healthcare organizations
- **SOX**: Financial organizations may require additional access controls
- **Industry Standards**: Follow your organization's security policies

## Common Issues

### Authentication Failures

**Issue**: `Authentication failed` or `invalid_client` errors

**Solutions**:
1. Verify `client_id` and `client_secret` are correct
2. Ensure client secret hasn't expired
3. Check that the app registration is enabled
4. Verify tenant ID is correct

### Permission Errors

**Issue**: `Insufficient privileges` or `Forbidden` errors

**Solutions**:
1. Grant admin consent for all required permissions
2. Wait 5-10 minutes after granting consent
3. Verify permissions are application-level, not delegated
4. Check that the service principal is enabled

### Network Connectivity

**Issue**: `Network timeout` or `ENOTFOUND` errors

**Solutions**:
1. Verify internet connectivity
2. Check firewall and proxy settings
3. Ensure `https://graph.microsoft.com` is accessible
4. Test with a simple curl command

### Rate Limiting

**Issue**: `Too many requests` or rate limit errors

**Solutions**:
1. Reduce `events_max_results` parameter
2. Increase sync interval for frequent runs
3. Use incremental sync instead of full refresh
4. Implement specific calendar filtering

## Getting Help

### Microsoft Documentation

- [Microsoft Graph API Documentation](https://docs.microsoft.com/en-us/graph/)
- [Azure App Registration Guide](https://docs.microsoft.com/en-us/azure/active-directory/develop/quickstart-register-app)
- [Graph API Permissions Reference](https://docs.microsoft.com/en-us/graph/permissions-reference)

### Faros Support

1. **Check Troubleshooting Guide**: See TROUBLESHOOTING.md for common issues
2. **Review Logs**: Enable detailed logging for debugging
3. **Create Support Ticket**: Contact Faros support with configuration details
4. **Community Resources**: Check Faros community forums and documentation

### Azure Support

- **Azure Portal**: Use the built-in support system in Azure portal
- **Microsoft Q&A**: Search for solutions in Microsoft Q&A forums
- **Premier Support**: Contact Microsoft directly if you have a support contract

---

**Next Steps**: After completing this setup, see the main README.md for usage instructions and TROUBLESHOOTING.md for common issues and solutions.