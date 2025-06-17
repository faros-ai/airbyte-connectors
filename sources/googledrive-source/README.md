# Google Drive Source

This is the repository for the Google Drive source connector, written in TypeScript.
For information about how to use this connector within Airbyte, see [the
documentation](https://docs.airbyte.io/integrations/sources/googledrive).

## Streams

This connector provides the following streams:

* **Activity**: Drive activity events from specific shared drives or the root drive
* **Workspace Users**: All users in the Google Workspace organization (requires Admin Directory API access)
* **Workspace**: Single record containing the Google Workspace customer information (requires Admin Directory API access)

## Local development

### Prerequisites

**To iterate on this connector, make sure to complete this prerequisites
section.**

#### Minimum Node.js version required `= 14.5`

#### Build connector

From the root repository directory (NOT this folder), run:

```
npm run prepare
```

This will install all required dependencies and build all included connectors,
including the Google Drive source connector.

Now you can cd into the Google Drive connector directory, `sources/googledrive-source`,
and iterate on the Google Drive source connector. After making code changes, run:

```
npm run build
```

#### Create credentials

Follow the instructions in the
[documentation](https://docs.airbyte.io/integrations/sources/googledrive) to
generate the necessary credentials. Then create a file `secrets/config.json`
conforming to the `resources/spec.json` file. Note that any directory named
`secrets` is gitignored across the entire `airbyte-connectors` repo, so there is
no danger of accidentally checking in sensitive information. See
`test_files/config.json` for a sample config file.
Create credentials:

- This source can accept using read-only access to Drive Activity and Admin Directory APIs.
- Create [Service Account](https://console.cloud.google.com/apis/credentials)
- Use client_email and private_key from Service account

#### Enable Domain-wide Delegation for service account

Setup requirements: Google Workspace Admin permissions

In normal cases, one's Drive activities can only be accessed by its owner or specific users that it is shared to. This is good for personal use, but in an organization that required data from all members' Drive activities, using one service account for each member, or forcing all members to share their Drive activities with an account is troublesome.

Google has introduced an feature named Domain-wide Delegation, in which it allows a service account to call APIs on behalf of users in a Google Workspace organization. With this, one service account can access all organization members' Drive activities without extra configuration efforts.

Refer to this [link](https://developers.google.com/workspace/guides/create-credentials#optional_set_up_domain-wide_delegation_for_a_service_account) to know how to enable Domain-wide Delegation for the service account.

Scopes required for delegation: 
- `https://www.googleapis.com/auth/drive.activity.readonly` (for Drive Activity)
- `https://www.googleapis.com/auth/admin.directory.user.readonly` (for Workspace Users)
- `https://www.googleapis.com/auth/admin.directory.customer.readonly` (for Workspace Users)

#### Shared Drive Configuration

The connector supports querying activities from specific shared drives. You can configure the `shared_drive_ids` parameter in your configuration:

- If `shared_drive_ids` is empty or not specified, the connector will query activities from the root drive (`items/root`)
- If `shared_drive_ids` contains one or more shared drive IDs, the connector will create separate data streams for each shared drive, querying activities with `ancestorName = "items/{shared_drive_id}"`

#### Personal Drives Configuration

You can control whether personal drives (user drives) are included in activity processing using the `include_personal_drives` parameter:

- If `include_personal_drives` is `true` (default), activities from all workspace users' personal drives will be included
- If `include_personal_drives` is `false`, only shared drives specified in `shared_drive_ids` will be processed
- This setting is useful when you only want to monitor shared drives and not individual user activities

Example configuration with shared drives only:
```json
{
  "private_key": "PRIVATE_KEY",
  "client_email": "CLIENT_EMAIL", 
  "shared_drive_ids": ["1ABC123DEF456GHI789JKL", "2MNO456PQR789STU123VWX"],
  "include_personal_drives": false,
  "domain_wide_delegation": true,
  "cutoff_days": 90
}
```

Example configuration with both personal and shared drives:
```json
{
  "private_key": "PRIVATE_KEY",
  "client_email": "CLIENT_EMAIL", 
  "shared_drive_ids": ["1ABC123DEF456GHI789JKL", "2MNO456PQR789STU123VWX"],
  "include_personal_drives": true,
  "domain_wide_delegation": true,
  "cutoff_days": 90
}
```

To find your shared drive IDs:
1. Open Google Drive in your browser
2. Navigate to the shared drive
3. The shared drive ID is in the URL: `https://drive.google.com/drive/folders/{SHARED_DRIVE_ID}`

### Locally running the connector

```
bin/main spec
bin/main check --config secrets/config.json
bin/main discover --config secrets/config.json
bin/main read --config secrets/config.json --catalog test_files/full_configured_catalog.json
```

### Locally running the connector docker image

#### Build

Go back to the root repository directory and run:
First, make sure you build the latest Docker image:

```
docker build . --build-arg path=sources/googledrive-source --build-arg version=0.0.1 -t googledrive-source
```

#### Run

Then return to the Google Drive connector directory and run any of the connector
commands as follows:

```
docker run --rm googledrive-source spec
docker run --rm -v $(pwd)/secrets:/secrets googledrive-source check --config /secrets/config.json
docker run --rm -v $(pwd)/secrets:/secrets googledrive-source discover --config /secrets/config.json
docker run --rm -v $(pwd)/secrets:/secrets -v $(pwd)/test_files:/test_files googledrive-source read --config /secrets/config.json --catalog /test_files/full_configured_catalog.json
```

## Testing

### Unit Tests

To run unit tests locally, from the Google Drive connector directory run:

```
npm test
```
