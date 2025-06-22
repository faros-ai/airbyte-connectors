# Google Calendar Source

This is the repository for the Google Calendar source connector, written in Typescript.
See [Common Development Instructions for Source Connectors](../README.md#common-development-instructions-for-source-connectors) for setting up your development environment.

#### Create credentials

- This source can accept using read-only access to Calendars.
- Create [Service Account](https://console.cloud.google.com/apis/credentials)
- Use client_email and private_key from Service account

Then create a file `secrets/config.json` conforming to the `resources/spec.json` file.

#### Enable Domain-wide Delegation for service account

Setup requirements: Google Workspace Admin permissions

In normal cases, one's calendar can only be accessed by its owner or specific users that it is shared to. This is good for personal use, but in an organization that required data from all members' calendars, using one service account for each member, or forcing all members to share their calendars with an account is troublesome.

Google has introduced an feature named Domain-wide Delegation, in which it allows a service account to call APIs on behalf of users in a Google Workspace organization. With this, one service account can access all organization members' calendars without extra configuration efforts.

Refer to this [link](https://developers.google.com/workspace/guides/create-credentials#optional_set_up_domain-wide_delegation_for_a_service_account) to know how to enable Domain-wide Delegation for the service account.

Scopes required for delegation: `https://www.googleapis.com/auth/calendar.readonly`

