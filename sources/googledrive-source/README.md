# Google Drive Source

This is the repository for the Google Drive source connector, written in TypeScript.

For common build, test, and run instructions, see the [common source documentation](../README.md#common-development-instructions).

## Streams

This connector provides the following streams:

* **Activity**: Drive activity events from specific shared drives or the root drive
* **Workspace Users**: All users in the Google Workspace organization (requires Admin Directory API access)
* **Workspace**: Single record containing the Google Workspace customer information (requires Admin Directory API access)

## Create credentials

- This source can accept using read-only access to Drive Activity and Admin Directory APIs.
- Create [Service Account](https://console.cloud.google.com/apis/credentials)
- Use client_email and private_key from Service account

## Domain-wide Delegation for Workspace Access

Setup requirements: Google Workspace Admin permissions

To access workspace users and personal drives, you need to configure domain-wide delegation. This allows a service account to call APIs on behalf of users in a Google Workspace organization, enabling access to all organization members' Drive activities and workspace data.

Domain-wide delegation is automatically enabled when you specify a `delegated_admin_user` in your configuration. The specified user must be a Google Workspace admin.

Refer to this [link](https://developers.google.com/workspace/guides/create-credentials#optional_set_up_domain-wide_delegation_for_a_service_account) to know how to enable Domain-wide Delegation for the service account.

Scopes required for delegation: 
- `https://www.googleapis.com/auth/drive.activity.readonly` (for Drive Activity)
- `https://www.googleapis.com/auth/admin.directory.user.readonly` (for Workspace Users)
- `https://www.googleapis.com/auth/admin.directory.customer.readonly` (for Workspace Customer)

## Shared Drive Configuration

The connector supports querying activities from specific shared drives. You can configure the `shared_drive_ids` parameter in your configuration:

- If `shared_drive_ids` is empty or not specified, the connector will query activities from the root drive (`items/root`)
- If `shared_drive_ids` contains one or more shared drive IDs, the connector will create separate data streams for each shared drive, querying activities with `ancestorName = "items/{shared_drive_id}"`

## Personal Drives Configuration

You can control whether personal drives (user drives) are included in activity processing using the `include_personal_drives` parameter:

- If `include_personal_drives` is `true` (default), activities from all workspace users' personal drives will be included
- If `include_personal_drives` is `false`, only shared drives specified in `shared_drive_ids` will be processed
- This setting is useful when you only want to monitor shared drives and not individual user activities

**Note**: Personal drives can only be accessed when `delegated_admin_user` is specified and domain-wide delegation is properly configured.

## Configuration Examples

### Shared Drives Only (No Domain-wide Delegation)
```json
{
  "private_key": "PRIVATE_KEY",
  "client_email": "CLIENT_EMAIL", 
  "shared_drive_ids": ["1ABC123DEF456GHI789JKL", "2MNO456PQR789STU123VWX"],
  "include_personal_drives": false,
  "cutoff_days": 90
}
```

### Full Workspace Access (With Domain-wide Delegation)
```json
{
  "private_key": "PRIVATE_KEY",
  "client_email": "CLIENT_EMAIL", 
  "delegated_admin_user": "admin@company.com",
  "shared_drive_ids": ["1ABC123DEF456GHI789JKL", "2MNO456PQR789STU123VWX"],
  "include_personal_drives": true,
  "cutoff_days": 90
}
```

### Personal Drives Only (With Domain-wide Delegation)
```json
{
  "private_key": "PRIVATE_KEY",
  "client_email": "CLIENT_EMAIL", 
  "delegated_admin_user": "admin@company.com",
  "shared_drive_ids": [],
  "include_personal_drives": true,
  "cutoff_days": 90
}
```

To find your shared drive IDs:
1. Open Google Drive in your browser
2. Navigate to the shared drive
3. The shared drive ID is in the URL: `https://drive.google.com/drive/folders/{SHARED_DRIVE_ID}`