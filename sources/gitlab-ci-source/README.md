# Gitlab CI Source

This is the repository for the Gitlab CI source connector, written in Typescript.

See [Common Development Instructions for Source Connectors](../README.md#common-development-instructions-for-source-connectors) for setting up your development environment.

#### Create credentials

Provide necessary credentials:

`token` - Log into your GitLab account and then generate a [personal Access Token](https://docs.gitlab.com/ee/user/profile/personal_access_tokens.html).

`groupName` - Name of Gitlab group (e.g. faros.io)

`projects` - List of projects of the group (e.g. project1, project2, ...)

Then create a file `secrets/config.json`
conforming to the `resources/spec.json` file.
