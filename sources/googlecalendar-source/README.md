# Google Calendar Source

This is the repository for the Google Calendar source connector, written in Typescript.
For information about how to use this connector within Airbyte, see [the
documentation](https://docs.airbyte.io/integrations/sources/googlecalendar).

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
including the Google Calendar source connector.

Now you can cd into the Google Calendar connector directory, `sources/googlecalendar-source`,
and iterate on the Google Calendar source connector. After making code changes, run:

```
npm run build
```

#### Create credentials

Follow the instructions in the
[documentation](https://docs.airbyte.io/integrations/sources/googlecalendar) to
generate the necessary credentials. Then create a file `secrets/config.json`
conforming to the `resources/spec.json` file. Note that any directory named
`secrets` is gitignored across the entire `airbyte-connectors` repo, so there is
no danger of accidentally checking in sensitive information. See
`test_files/config.json` for a sample config file.
Create credentials:

- This source can accept using read-only access to Calendars.
- Create [Service Account](https://console.cloud.google.com/apis/credentials)
- Use client_email and private_key from Service account

#### Enable Domain-wide Delegation for service account

Setup requirements: Google Workspace Admin permissions

In normal cases, one's calendar can only be accessed by its owner or specific users that it is shared to. This is good for personal use, but in an organization that required data from all members' calendars, using one service account for each member, or forcing all members to share their calendars with an account is troublesome.

Google has introduced an feature named Domain-wide Delegation, in which it allows a service account to call APIs on behalf of users in a Google Workspace organization. With this, one service account can access all organization members' calendars without extra configuration efforts.

Refer to this [link](https://developers.google.com/workspace/guides/create-credentials#optional_set_up_domain-wide_delegation_for_a_service_account) to know how to enable Domain-wide Delegation for the service account.

Scopes required for delegation: `https://www.googleapis.com/auth/calendar.readonly`

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
docker build . --build-arg path=sources/googlecalendar-source --build-arg version=0.0.1 -t googlecalendar-source
```

#### Run

Then return to the Google Calendar connector directory and run any of the connector
commands as follows:

```
docker run --rm googlecalendar-source spec
docker run --rm -v $(pwd)/secrets:/secrets googlecalendar-source check --config /secrets/config.json
docker run --rm -v $(pwd)/secrets:/secrets googlecalendar-source discover --config /secrets/config.json
docker run --rm -v $(pwd)/secrets:/secrets -v $(pwd)/test_files:/test_files googlecalendar-source read --config /secrets/config.json --catalog /test_files/full_configured_catalog.json
```

## Testing

### Unit Tests

To run unit tests locally, from the Google Calendar connector directory run:

```
npm test
```


## Dependency Management

We use [lerna](https://lerna.js.org/) to manage dependencies that are shared by
all connectors in this repository. Dependencies specific to this connector
should go in the connector's `package.json`. Dependencies shared by all
connectors, such as linting/formatting tools, should go in the root
`package.json`.
