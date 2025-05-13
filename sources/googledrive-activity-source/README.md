# Google Drive Activity Source

This is the repository for the Google Drive Activity source connector, written in TypeScript.
For information about how to use this connector within Airbyte, see [the
documentation](https://docs.airbyte.io/integrations/sources/googledrive-activity).

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
including the Google Drive Activity source connector.

Now you can cd into the Google Drive Activity connector directory, `sources/googledrive-activity-source`,
and iterate on the Google Drive Activity source connector. After making code changes, run:

```
npm run build
```

#### Create credentials

Follow the instructions in the
[documentation](https://docs.airbyte.io/integrations/sources/googledrive-activity) to
generate the necessary credentials. Then create a file `secrets/config.json`
conforming to the `resources/spec.json` file. Note that any directory named
`secrets` is gitignored across the entire `airbyte-connectors` repo, so there is
no danger of accidentally checking in sensitive information. See
`test_files/config.json` for a sample config file.
Create credentials:

- This source can accept using read-only access to Drive Activity.
- Create [Service Account](https://console.cloud.google.com/apis/credentials)
- Use client_email and private_key from Service account

#### Enable Domain-wide Delegation for service account

Setup requirements: Google Workspace Admin permissions

In normal cases, one's Drive activities can only be accessed by its owner or specific users that it is shared to. This is good for personal use, but in an organization that required data from all members' Drive activities, using one service account for each member, or forcing all members to share their Drive activities with an account is troublesome.

Google has introduced an feature named Domain-wide Delegation, in which it allows a service account to call APIs on behalf of users in a Google Workspace organization. With this, one service account can access all organization members' Drive activities without extra configuration efforts.

Refer to this [link](https://developers.google.com/workspace/guides/create-credentials#optional_set_up_domain-wide_delegation_for_a_service_account) to know how to enable Domain-wide Delegation for the service account.

Scopes required for delegation: `https://www.googleapis.com/auth/drive.activity.readonly`

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
docker build . --build-arg path=sources/googledrive-activity-source --build-arg version=0.0.1 -t googledrive-activity-source
```

#### Run

Then return to the Google Drive Activity connector directory and run any of the connector
commands as follows:

```
docker run --rm googledrive-activity-source spec
docker run --rm -v $(pwd)/secrets:/secrets googledrive-activity-source check --config /secrets/config.json
docker run --rm -v $(pwd)/secrets:/secrets googledrive-activity-source discover --config /secrets/config.json
docker run --rm -v $(pwd)/secrets:/secrets -v $(pwd)/test_files:/test_files googledrive-activity-source read --config /secrets/config.json --catalog /test_files/full_configured_catalog.json
```

## Testing

### Unit Tests

To run unit tests locally, from the Google Drive Activity connector directory run:

```
npm test
```
