# Gerrit Source

This Airbyte source syncs data from Gerrit code review systems.

## Stream Records Structure

### faros_projects

Syncs Gerrit projects (repositories).

**Record Structure:**
```typescript
interface ProjectInfo {
  id: string;                    // Required: URL-encoded project name
  name?: string;                 // Project name
  parent?: string;               // Name of parent project
  description?: string;          // Project description
  state?: 'ACTIVE' | 'READ_ONLY' | 'HIDDEN';  // Project state
  labels?: {                     // Project label configuration
    [labelName: string]: {
      values: { [score: string]: string };
      default_value?: number;
    }
  };
  web_links?: WebLink[];         // Web links for the project
}
```

**Documentation:** [Gerrit Projects REST API](https://gerrit-review.googlesource.com/Documentation/rest-api-projects.html)

### faros_changes

Syncs Gerrit changes (equivalent to pull requests).

**Record Structure:**
```typescript
interface ChangeInfo {
  // Required fields
  id: string;                    // Unique change identifier
  project: string;               // Project name
  branch: string;                // Target branch
  change_id: string;             // Change-Id from commit message
  subject: string;               // Change subject (first line of commit)
  status: 'NEW' | 'MERGED' | 'ABANDONED';  // Change status
  created: string;               // ISO timestamp of creation
  updated: string;               // ISO timestamp of last update  
  _number: number;               // Change number
  owner: AccountInfo;            // Change owner account

  // Optional fields
  topic?: string;                // Change topic
  hashtags?: string[];           // Change hashtags
  attention_set?: {              // Accounts with attention
    [accountId: string]: AttentionSetInfo;
  };
  assignee?: AccountInfo;        // Change assignee
  submitter?: AccountInfo;       // Change submitter
  submitted?: string;            // ISO timestamp of submission
  mergeable?: boolean;           // Whether change is mergeable
  submittable?: boolean;         // Whether change is submittable
  insertions?: number;           // Lines inserted
  deletions?: number;            // Lines deleted
  total_comment_count?: number;  // Total comments
  unresolved_comment_count?: number;  // Unresolved comments
  labels?: {                     // Review labels and votes
    [labelName: string]: LabelInfo;
  };
  reviewers?: {                  // Reviewers by type
    [reviewerType: string]: AccountInfo[];
  };
  messages?: ChangeMessageInfo[]; // Change messages/comments
  current_revision?: string;     // Current revision SHA
  revisions?: {                  // All revisions/patchsets
    [sha: string]: RevisionInfo;
  };
  is_private?: boolean;          // Whether change is private
  work_in_progress?: boolean;    // Whether change is WIP
  has_review_started?: boolean;  // Whether review started
}
```

**Documentation:** [Gerrit Changes REST API](https://gerrit-review.googlesource.com/Documentation/rest-api-changes.html)

### faros_accounts

Syncs Gerrit user accounts.

**Record Structure:**
```typescript
interface AccountInfo {
  _account_id?: number;          // Unique numeric account ID
  name?: string;                 // Full name (when detailed info requested)
  display_name?: string;         // Display name
  email?: string;                // Primary email (when detailed info requested)
  secondary_emails?: string[];   // Secondary emails (with ALL_EMAILS option)
  username?: string;             // Username (when detailed info requested)
  avatars?: AvatarInfo[];        // User avatars
  status?: string;               // Account status message
  inactive?: boolean;            // Whether account is inactive
  tags?: string[];               // Account tags
  _more_accounts?: boolean;      // Whether more accounts available
}
```

**Documentation:** [Gerrit Accounts REST API](https://gerrit-review.googlesource.com/Documentation/rest-api-accounts.html)

## Supporting Types

### AccountInfo
```typescript
interface AccountInfo {
  _account_id?: number;
  name?: string;
  display_name?: string;
  email?: string;
  username?: string;
  status?: string;
  inactive?: boolean;
}
```

### LabelInfo
```typescript
interface LabelInfo {
  approved?: AccountInfo;        // Account that approved
  rejected?: AccountInfo;        // Account that rejected
  value?: number;                // Current vote value
  default_value?: number;        // Default vote value
  all?: ApprovalInfo[];          // All votes for this label
}
```

### RevisionInfo
```typescript
interface RevisionInfo {
  kind: string;                  // Revision kind
  _number: number;               // Revision number (patchset)
  created: string;               // ISO timestamp of creation
  uploader: AccountInfo;         // Account that uploaded revision
  ref: string;                   // Git reference
  commit?: CommitInfo;           // Commit information
  files?: {                      // Files changed in revision
    [filename: string]: FileInfo;
  };
}
```

### ChangeMessageInfo
```typescript
interface ChangeMessageInfo {
  id: string;                    // Message ID
  author?: AccountInfo;          // Message author
  date: string;                  // ISO timestamp
  message: string;               // Message content
  _revision_number?: number;     // Associated revision number
}
```

## Configuration

The connector supports multiple authentication methods:

### Authentication Options

1. **HTTP Password** - Traditional username/password (if supported by your Gerrit instance)
2. **Cookie Authentication** - Direct cookie value from browser/curl
3. **Git Cookie** - Cookie from Gerrit's "HTTP Password" setup script or .gitcookies file

### Git Cookie Setup (Recommended)

When you click "HTTP Password" in modern Gerrit instances, you often get a bash script like:
```bash
touch ~/.gitcookies
echo 'gerrit.example.com	FALSE	/	TRUE	0	o	git-username.example.com=1//0XXXXXXXXXX' >> ~/.gitcookies
```

For the connector, use the **Git Cookie (from .gitcookies)** option and paste either:
- The entire line from the script: `gerrit.example.com	FALSE	/	TRUE	0	o	git-username.example.com=1//0XXXXXXXXXX`  
- Just the cookie part: `o=git-username.example.com=1//0XXXXXXXXXX`

### Example Configurations

**Git Cookie:**
```json
{
  "url": "https://gerrit.example.com",
  "authentication": {
    "type": "git_cookie",
    "git_cookie_value": "gerrit.example.com\tFALSE\t/\tTRUE\t0\to\tgit-username.example.com=1//0XXXXXXXXXX"
  }
}
```

**Direct Cookie:**
```json
{
  "url": "https://gerrit.example.com", 
  "authentication": {
    "type": "cookie",
    "cookie_value": "GerritAccount=...; o=git-username.example.com=1//0XXXXXXXXXX"
  }
}
```

## API Limitations

- All API requests use authenticated endpoints (prefixed with `/a/`)
- Responses include Gerrit's magic prefix `)]}'` which is automatically stripped
- Pagination uses `start` and `limit` parameters
- Query complexity is limited by URL length for change queries