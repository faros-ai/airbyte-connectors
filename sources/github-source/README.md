# GitHub Source

This is the repository for the Github source connector, written in Typescript.

## Local development

### Prerequisites

**To iterate on this connector, make sure to complete this prerequisites
section.**

#### Minimum Node.js version required `= 18`

#### Build connector

From the root repository directory (NOT this folder), run:

```
npm run prepare
```

This will install all required dependencies and build all included connectors,
including the Github source connector.

Now you can cd into the Github connector directory, `sources/github-source`,
and iterate on the Github source connector. After making code changes, run:

```
npm run build
```

#### Create credentials

### Locally running the connector

```
bin/main spec
bin/main check --config secrets/config.json
bin/main discover --config secrets/config.json
bin/main read --config secrets/config.json --catalog test_files/full_configured_catalog.json
```

### Locally running the connector docker image

#### Build

Go back to the root repository directory and run follow the instructions under
Build Docker Images in the [README](../../README.md)

#### Run

Then return to the Github connector directory and run any of the connector
commands as follows:

```
docker run --rm github-source spec
docker run --rm -v $(pwd)/secrets:/secrets github-source check --config /secrets/config.json
docker run --rm -v $(pwd)/secrets:/secrets github-source discover --config /secrets/config.json
docker run --rm -v $(pwd)/secrets:/secrets -v $(pwd)/test_files:/test_files github-source read --config /secrets/config.json --catalog /test_files/full_configured_catalog.json
```

## Testing

### Unit Tests

To run unit tests locally, from the Github connector directory run:

```
npm test
```

## Dependency Management

We use [lerna](https://lerna.js.org/) to manage dependencies that are shared by
all connectors in this repository. Dependencies specific to this connector
should go in the connector's `package.json`. Dependencies shared by all
connectors, such as linting/formatting tools, should go in the root
`package.json`.

### GitHub Required Permissions per Stream

( * ) Permissions marked as required are always read-only.\
( ** ) If using token, issuer must be an owner of the organization.\
( *** ) Fine-grained tokens only have access to one organization and must be explicitly passed in the configuration since it's not discoverable.


| Stream                       | Token (classic)      | Token (fine-grained) \| GitHub App ( * )         |
|------------------------------|----------------------|--------------------------------------------------|
| Code Scanning Alerts         | repo                 | Repository: Metadata & Code Scanning Alerts      |
| Commits                      | repo                 | Repository: Metadata & Contents                  |
| Copilot Seats ( ** )         | read:org             | Organization: Administration                     |
| Copilot Usage ( ** )         | read:org             | Organization: Administration & Members           |
| Dependabot Alerts            | repo                 | Repository: Metadata & Dependabot Alerts         |
| Issues                       | repo                 | Repository: Issues                               |
| Labels                       | repo                 | Repository: Metadata & (Pull Requests \| Issues) |
| Organizations                | —                    | —                                                |
| Projects                     | read:project         | Organization: Projects                           |
| Pull Requests                | repo                 | Repository: Metadata & Pull Requests             |
| Pull Request Comments        | repo                 | Repository: Metadata & Pull Requests             |
| Releases                     | repo                 | Repository: Metadata & Contents                  |
| Repositories                 | repo                 | Repository: Metadata                             |
| SAML SSO Users ( ** )        | read:org             | Organization: Administration                     |
| Secret Scanning Alerts       | repo                 | Repository: Metadata & Secret Scanning Alerts    |
| Tags                         | repo                 | Repository: Metadata                             |
| Teams                        | read:org             | Organization: Members                            |
| Team Memberships             | read:org             | Organization: Members                            |
| Users                        | read:org & read:user | Organization: Members                            |
| Outside Collaborators ( ** ) | read:org             | Organization: Members                            |
