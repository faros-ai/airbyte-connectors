# Bitbucket Server Source

This is the repository for the Bitbucket Server source connector, written in Typescript.

See [Common Development Instructions for Source Connectors](../README.md#common-development-instructions-for-source-connectors) for setting up your development environment.

**Note:** This connector requires Node.js version 16.x.

#### Create credentials

Follow the instructions in the
[documentation](https://confluence.atlassian.com/bitbucketserver/personal-access-tokens-939515499.html) to
generate a HTTP access token. Then create a file `secrets/config.json`
conforming to the `resources/spec.json` file.
