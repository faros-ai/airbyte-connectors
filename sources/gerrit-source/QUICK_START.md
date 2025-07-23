# Gerrit Connector Quick Start

## Step 1: Get Your Gerrit Authentication

1. **Go to your Gerrit instance** (e.g., `https://gerrit.company.com`)
2. **Login** → **Settings** → **HTTP Credentials** 
3. **Click "Generate Password"** or **"HTTP Password"**
4. **Copy the entire cookie line** from the bash script that appears

It will look like:
```bash
gerrit.company.com	FALSE	/	TRUE	0	o	git-username.company.com=1//0XXXXXXXXXX
```

## Step 2: Configure the Connector

1. **Copy the template:**
```bash
cp gerrit-config.template.json gerrit-config.json
```

2. **Edit `gerrit-config.json`:**
```json
{
  "url": "https://your-gerrit-instance.com",
  "authentication": {
    "type": "git_cookie",
    "git_cookie_value": "PASTE_YOUR_ENTIRE_COOKIE_LINE_HERE"
  },
  "projects": ["your-project-name"],
  "cutoff_days": 7,
  "page_size": 5
}
```

## Step 3: Test the Connector

### Quick Sample Test
```bash
# Build the connector
npm run build

# Test with sample data from each stream
node test-sample.js gerrit-config.json
```

### Full Connector Test
```bash
# Test connection
node lib/index.js check --config gerrit-config.json

# Get connector spec
node lib/index.js spec

# Discover streams
node lib/index.js discover --config gerrit-config.json > catalog.json

# Read data (limited sample)
node lib/index.js read --config gerrit-config.json --catalog catalog.json
```

## Authentication Types

### 🔥 Git Cookie (Recommended)
Use when Gerrit gives you a bash script with cookie:
```json
{
  "type": "git_cookie",
  "git_cookie_value": "gerrit.example.com\tFALSE\t/\tTRUE\t0\to\tgit-user.example.com=1//0XXXXXXXXXX"
}
```

### 🍪 Direct Cookie
Use when you have a direct cookie string:
```json
{
  "type": "cookie", 
  "cookie_value": "GerritAccount=...; o=git-user.example.com=1//0XXXXXXXXXX"
}
```

### 🔒 HTTP Password
Use when you have traditional username/password:
```json
{
  "type": "http_password",
  "username": "your-username",
  "password": "your-password"
}
```

## Troubleshooting

### "Authentication failed"
- ✅ Check your Gerrit URL is correct
- ✅ Verify your cookie/credentials are fresh (they expire)
- ✅ Ensure you have access to the specified projects

### "No records found"
- ✅ Check if the projects exist and you have read access
- ✅ Try increasing `cutoff_days` (maybe no recent activity)
- ✅ Remove `projects` filter to test with all visible projects

### "Connection timeout"
- ✅ Check if Gerrit instance is reachable
- ✅ Verify no firewall/VPN issues
- ✅ Try increasing `timeout` in config

## Example Output

When working correctly, `test-sample.js` will show:
```
🚀 Gerrit Connector Sample Data Test
====================================

📁 Using config: gerrit-config.json
🌐 Gerrit URL: https://gerrit.company.com
🔐 Auth type: git_cookie
📂 Projects: my-project

🔌 Testing connection...
✅ Connection successful!

🔍 Testing stream: faros_projects
==================================================
✅ Sample record:
{
  "id": "my-project",
  "name": "my-project", 
  "description": "My awesome project",
  "state": "ACTIVE"
}

🔍 Testing stream: faros_changes
==================================================
✅ Sample record:
{
  "id": "my-project~main~I1234567890abcdef",
  "project": "my-project",
  "branch": "main",
  "subject": "Fix important bug",
  "status": "NEW",
  "_number": 12345,
  "owner": {
    "_account_id": 1000,
    "name": "John Doe"
  }
}
```