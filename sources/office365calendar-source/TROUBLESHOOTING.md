# Office 365 Calendar Connector Troubleshooting Guide

This guide helps you diagnose and resolve common issues with the Office 365 Calendar connector.

## Table of Contents

1. [Quick Diagnostics](#quick-diagnostics)
2. [Authentication Issues](#authentication-issues)
3. [Permission Errors](#permission-errors)
4. [Network and Connectivity](#network-and-connectivity)
5. [Data Sync Issues](#data-sync-issues)
6. [Performance Problems](#performance-problems)
7. [Configuration Errors](#configuration-errors)
8. [Azure AD Issues](#azure-ad-issues)
9. [Logging and Debugging](#logging-and-debugging)
10. [Advanced Troubleshooting](#advanced-troubleshooting)

## Quick Diagnostics

### Step 1: Verify Basic Configuration

Run the connection check to identify immediate issues:

```bash
node lib/index.js check --config config.json
```

### Common Quick Fixes

| Issue | Quick Fix |
|-------|-----------|
| Invalid JSON config | Validate JSON syntax with `jq . config.json` |
| Missing required fields | Ensure `client_id`, `client_secret`, `tenant_id` are set |
| Expired client secret | Generate new secret in Azure portal |
| Wrong tenant ID | Verify tenant ID matches your Azure AD |

### Step 2: Test with Minimal Configuration

Create a minimal config file to isolate issues:

```json
{
  "client_id": "your-client-id",
  "client_secret": "your-client-secret",
  "tenant_id": "your-tenant-id"
}
```

## Authentication Issues

### Error: "Authentication failed" or "invalid_client"

**Symptoms:**
- Connection check fails with authentication error
- Error messages mention invalid client credentials
- HTTP 401 Unauthorized responses

**Root Causes:**
1. Incorrect `client_id` or `client_secret`
2. Expired client secret
3. App registration disabled
4. Wrong tenant ID

**Solutions:**

#### 1. Verify Client Credentials
```bash
# Check if your client_id is a valid GUID format
echo "client_id: your-client-id-here"
# Should be: 12345678-1234-1234-1234-123456789012
```

#### 2. Generate New Client Secret
1. Go to Azure Portal > App registrations
2. Select your app
3. Go to "Certificates & secrets"
4. Create new client secret
5. Update config with new secret

#### 3. Check App Registration Status
1. In Azure Portal, verify app is enabled
2. Check "Supported account types" matches your tenant
3. Ensure app hasn't been deleted or disabled

#### 4. Validate Tenant ID
```bash
# Verify tenant ID format (should be GUID or domain)
# GUID: 87654321-4321-4321-4321-210987654321
# Domain: yourdomain.onmicrosoft.com
```

### Error: "AADSTS7000215: Invalid client secret is provided"

**Solution:**
1. The client secret has expired or is incorrect
2. Generate a new client secret in Azure portal
3. Update your configuration immediately
4. Test connection again

### Error: "AADSTS90002: Tenant not found"

**Solutions:**
1. Verify the `tenant_id` is correct
2. Use the Directory (tenant) ID from Azure portal, not the domain name
3. Ensure you have access to the specified tenant
4. Check for typos in the tenant ID

## Permission Errors

### Error: "Insufficient privileges to complete the operation"

**Symptoms:**
- Connection succeeds but data sync fails
- Calendar or event queries return 403 Forbidden
- Error mentions insufficient privileges

**Root Causes:**
1. Missing Microsoft Graph API permissions
2. Admin consent not granted
3. Using delegated permissions instead of application permissions
4. Service principal not enabled

**Solutions:**

#### 1. Grant Required Permissions
In Azure Portal > App registrations > API permissions:

**For Basic Access:**
- `Calendars.Read` (Application permission)
- `User.Read` (Application permission)

**For Organization-Wide Access:**
- `Calendars.Read.All` (Application permission)
- `User.Read.All` (Application permission)
- `Directory.Read.All` (Application permission)

#### 2. Grant Admin Consent
1. Click "Grant admin consent for [Organization]"
2. Wait 5-10 minutes for changes to propagate
3. Verify all permissions show green checkmarks

#### 3. Check Permission Types
Ensure you're using **Application permissions**, not **Delegated permissions**:
- ❌ Delegated permissions (requires user sign-in)
- ✅ Application permissions (service-to-service)

### Error: "Access denied" for specific calendars

**Solutions:**
1. **Organization Policy**: Check if calendar sharing is restricted
2. **User Permissions**: Verify the service principal has access to specific calendars
3. **Calendar Configuration**: Some calendars may be private or restricted
4. **Remove Specific IDs**: Try syncing without `calendar_ids` filter first

## Network and Connectivity

### Error: "Network timeout" or "ENOTFOUND"

**Symptoms:**
- Connection timeouts
- DNS resolution failures
- Intermittent connectivity issues

**Solutions:**

#### 1. Test Basic Connectivity
```bash
# Test connectivity to Microsoft Graph
curl -v https://graph.microsoft.com/v1.0/

# Test DNS resolution
nslookup graph.microsoft.com

# Test with proxy if applicable
curl -v --proxy your-proxy:port https://graph.microsoft.com/v1.0/
```

#### 2. Firewall and Proxy Configuration
Ensure these endpoints are accessible:
- `https://graph.microsoft.com`
- `https://login.microsoftonline.com`
- `https://graph.microsoft.us` (US Government)

#### 3. Corporate Network Issues
```bash
# Check proxy environment variables
echo $HTTP_PROXY
echo $HTTPS_PROXY
echo $NO_PROXY

# Test with explicit proxy
node lib/index.js check --config config.json --proxy your-proxy:port
```

### Error: "SSL certificate" or "self-signed certificate"

**Solutions:**
1. **Corporate Proxy**: Configure proxy SSL certificates
2. **Node.js Settings**: Set `NODE_TLS_REJECT_UNAUTHORIZED=0` (development only)
3. **Certificate Store**: Update system certificate store
4. **Proxy Configuration**: Configure proxy to handle SSL properly

## Data Sync Issues

### Error: "No calendars found" or "Empty dataset"

**Possible Causes:**
1. User has no calendars
2. Calendar access permissions insufficient
3. Calendar filtering too restrictive
4. Organization policies blocking access

**Solutions:**

#### 1. Test with Different Configuration
```json
{
  "client_id": "your-client-id",
  "client_secret": "your-client-secret",
  "tenant_id": "your-tenant-id",
  "domain_wide_delegation": true,
  "cutoff_days": 30
}
```

#### 2. Check User Calendar Access
1. Verify user has calendars in Outlook
2. Test with different user account
3. Check organization calendar sharing policies

#### 3. Remove Calendar Filtering
Remove `calendar_ids` from config to sync all accessible calendars.

### Error: "Delta token expired" or "Invalid delta token"

**Symptoms:**
- Incremental sync fails after working previously
- Error mentions expired or invalid delta token
- Full refresh works but incremental doesn't

**Solutions:**

#### 1. Reset Incremental Sync State
```bash
# Remove state file to force full refresh
rm state.json

# Run full refresh to regenerate state
node lib/index.js read --config config.json --catalog catalog.json > state.json
```

#### 2. Configure Shorter Sync Intervals
Delta tokens expire after 7 days. Sync more frequently:
- Recommended: Every 24 hours
- Maximum: Every 7 days

### Error: "Too many events" or "Request too large"

**Solutions:**

#### 1. Reduce Batch Size
```json
{
  "events_max_results": 500,
  "cutoff_days": 90
}
```

#### 2. Use Calendar Filtering
```json
{
  "calendar_ids": ["specific-calendar-id-only"],
  "cutoff_days": 30
}
```

#### 3. Implement Chunked Processing
The connector automatically handles this, but you can:
- Reduce `events_max_results` to 100-500
- Sync smaller time ranges
- Process calendars individually

## Performance Problems

### Slow Sync Performance

**Symptoms:**
- Sync takes hours to complete
- High memory usage
- Frequent timeouts

**Solutions:**

#### 1. Optimize Configuration
```json
{
  "events_max_results": 1000,
  "cutoff_days": 180,
  "calendar_ids": ["important-calendars-only"]
}
```

#### 2. Use Incremental Sync
Always use incremental sync for production:
```bash
# First run (full refresh)
node lib/index.js read --config config.json --catalog catalog.json > state.json

# Subsequent runs (incremental)
node lib/index.js read --config config.json --catalog catalog.json --state state.json
```

#### 3. Monitor Resource Usage
```bash
# Monitor memory and CPU during sync
top -p $(pgrep -f "node.*index.js")

# Check Node.js memory usage
node --max-old-space-size=4096 lib/index.js read ...
```

### Rate Limiting Issues

**Error:** "Too many requests" or HTTP 429

**Solutions:**

#### 1. Implement Exponential Backoff
The connector handles this automatically, but you can:
- Reduce concurrent requests
- Increase delays between API calls
- Use smaller batch sizes

#### 2. Monitor Rate Limits
```bash
# Check current rate limit status
curl -H "Authorization: Bearer $TOKEN" \
     https://graph.microsoft.com/v1.0/me/calendars \
     -v 2>&1 | grep -i "rate"
```

#### 3. Optimize Request Patterns
- Use incremental sync to reduce API calls
- Filter calendars to only sync necessary data
- Avoid frequent full refreshes

## Configuration Errors

### Error: "Invalid configuration" or validation failures

**Common Issues:**

#### 1. JSON Syntax Errors
```bash
# Validate JSON syntax
jq . config.json

# Common syntax errors:
# - Missing quotes around strings
# - Trailing commas
# - Unescaped special characters
```

#### 2. Type Validation Errors
```json
{
  "events_max_results": "1000",  // ❌ Should be number
  "events_max_results": 1000,    // ✅ Correct

  "cutoff_days": "30",           // ❌ Should be number
  "cutoff_days": 30,             // ✅ Correct

  "calendar_ids": "calendar1",   // ❌ Should be array
  "calendar_ids": ["calendar1"]  // ✅ Correct
}
```

#### 3. Value Range Errors
```json
{
  "events_max_results": 50000,  // ❌ Too large (max 10000)
  "cutoff_days": 5000,          // ❌ Too large (max 3650)
  "cutoff_days": 0              // ❌ Too small (min 1)
}
```

### Calendar ID Format Issues

**Error:** Calendar IDs not found or invalid format

**Solutions:**

#### 1. Find Valid Calendar IDs
```bash
# Run discovery to see available calendar IDs
node lib/index.js discover --config config.json | grep -A 5 "calendars"

# Run a test sync to see actual calendar IDs in logs
node lib/index.js read --config config.json --catalog catalog.json | head -50
```

#### 2. Calendar ID Format
Office 365 calendar IDs are long base64-encoded strings:
```
AAMkAGVmMDEzMTM4LTZmYWUtNDdkNC1hMDZiLTU1OGY5OTZhYmY4OABGAAAAAAAiQ8W967B7TKBjgx9rVEURBwAiIsqMbYjsT5e-T7KzowPTAAAAAAEGAAAiIsqMbYjsT5e-T7KzowPTAAABFmfNAAA=
```

## Azure AD Issues

### Error: "Application with identifier was not found"

**Solutions:**
1. Verify the app registration exists in correct tenant
2. Check if app was deleted or disabled
3. Ensure you're using correct tenant ID
4. Recreate app registration if necessary

### Error: "The user or administrator has not consented"

**Solutions:**
1. Grant admin consent in Azure portal
2. Wait 5-10 minutes for propagation
3. Check conditional access policies
4. Verify service principal is enabled

### Error: "Application is disabled"

**Solutions:**
1. Re-enable app in Azure portal
2. Check organization policies
3. Verify app registration settings
4. Contact Azure AD administrator

## Logging and Debugging

### Enable Detailed Logging

#### 1. Environment Variables
```bash
# Enable debug logging
export DEBUG=*
export NODE_ENV=development

# Run with detailed logging
node lib/index.js check --config config.json
```

#### 2. Application Logging
```bash
# Increase log verbosity
node lib/index.js read --config config.json --catalog catalog.json --log-level debug
```

#### 3. Network Debugging
```bash
# Enable HTTP request/response logging
export DEBUG=axios,@azure/*,@microsoft/*
node lib/index.js check --config config.json
```

### Log Analysis

#### Common Log Patterns

**Authentication Success:**
```
Successfully connected to Office 365
Authentication token obtained
```

**Permission Issues:**
```
Insufficient privileges
Access denied
403 Forbidden
```

**Network Issues:**
```
ENOTFOUND
ECONNREFUSED
timeout
```

**Rate Limiting:**
```
Too many requests
429
rate limit exceeded
```

### Debug Configuration

Create a debug configuration file:
```json
{
  "client_id": "your-client-id",
  "client_secret": "your-client-secret",
  "tenant_id": "your-tenant-id",
  "events_max_results": 10,
  "cutoff_days": 1,
  "debug": true
}
```

## Advanced Troubleshooting

### Memory Issues

**Symptoms:**
- Out of memory errors
- Node.js heap size exceeded
- Slow performance with large datasets

**Solutions:**

#### 1. Increase Node.js Memory
```bash
node --max-old-space-size=8192 lib/index.js read --config config.json --catalog catalog.json
```

#### 2. Process Smaller Batches
```json
{
  "events_max_results": 100,
  "cutoff_days": 30
}
```

#### 3. Monitor Memory Usage
```bash
# Monitor memory during sync
ps aux | grep node
htop -p $(pgrep node)
```

### Concurrent Access Issues

**Error:** Conflicts with other applications accessing same calendars

**Solutions:**
1. Coordinate sync schedules with other applications
2. Use different Azure app registrations for different applications
3. Implement sync locking mechanisms
4. Stagger sync times to avoid conflicts

### Time Zone Issues

**Symptoms:**
- Event times appear incorrect
- Timezone conversion errors
- DST handling problems

**Solutions:**

#### 1. Verify System Timezone
```bash
# Check system timezone
timedatectl status
date

# Set correct timezone if needed
sudo timedatectl set-timezone America/New_York
```

#### 2. Configure Timezone in Code
The connector handles timezones automatically, but verify:
- System timezone is correct
- Events include timezone information
- UTC conversion is working properly

### Data Consistency Issues

**Symptoms:**
- Missing events after sync
- Duplicate events
- Inconsistent data between syncs

**Solutions:**

#### 1. Verify Incremental Sync State
```bash
# Check state file for consistency
cat state.json | jq .

# Reset state if corrupted
rm state.json && run full refresh
```

#### 2. Compare with Source Data
1. Check events in Outlook web interface
2. Verify calendar permissions and sharing
3. Compare timestamps and modification dates

## Getting Additional Help

### Faros Support

1. **Collect Diagnostic Information:**
   - Configuration file (remove secrets)
   - Error logs and messages
   - Steps to reproduce the issue
   - Environment details (OS, Node.js version)

2. **Create Support Ticket:**
   - Include all diagnostic information
   - Specify Office 365 Calendar connector
   - Provide timeline of when issue started

### Microsoft Support

1. **Azure Portal Support:**
   - Use built-in support for Azure AD issues
   - Include app registration details
   - Specify Microsoft Graph API problems

2. **Microsoft Graph Support:**
   - Use Microsoft Graph Explorer for API testing
   - Check Microsoft Graph documentation
   - Report API-specific issues to Microsoft

### Community Resources

- **Airbyte Community:** General connector issues
- **Microsoft Tech Community:** Office 365 and Azure AD questions
- **Stack Overflow:** Technical implementation questions
- **GitHub Issues:** Connector-specific bugs and feature requests

---

**Next Steps:** If you can't resolve your issue with this guide, collect the diagnostic information mentioned above and contact Faros support for assistance.