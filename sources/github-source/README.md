# GitHub Source

This is the repository for the Github source connector, written in Typescript.

See [Common Development Instructions for Source Connectors](../README.md#common-development-instructions-for-source-connectors) for setting up your development environment.

**Note:** This connector requires Node.js version 18.
### GitHub Required Permissions per Stream

( * ) Permissions marked as required are always read-only.\
( ** ) If using token, issuer must be an owner of the organization.\
( *** ) Fine-grained tokens only have access to one organization and must be explicitly passed in the configuration since it's not discoverable.


| Stream                 | Token (classic)      | Token (fine-grained) \| GitHub App ( * )         |
|------------------------|----------------------|--------------------------------------------------|
| Artifacts              | repo                 | Repository: Metadata & Actions                   |
| Code Scanning Alerts   | repo                 | Repository: Metadata & Code Scanning Alerts      |
| Commits                | repo                 | Repository: Metadata & Contents                  |
| Copilot Seats ( ** )   | read:org             | Organization: Administration                     |
| Copilot Usage ( ** )   | read:org             | Organization: Administration & Members           |
| Dependabot Alerts      | repo                 | Repository: Metadata & Dependabot Alerts         |
| Issues                 | repo                 | Repository: Metadata & Issues                    |
| Issue Comments         | repo                 | Repository: Metadata & (Pull Requests \| Issues) |
| Labels                 | repo                 | Repository: Metadata & (Pull Requests \| Issues) |
| Organizations          | —                    | —                                                |
| Projects               | read:project         | Organization: Projects                           |
| Pull Requests          | repo                 | Repository: Metadata & Pull Requests             |
| Pull Request Comments  | repo                 | Repository: Metadata & Pull Requests             |
| Releases               | repo                 | Repository: Metadata & Contents                  |
| Repositories           | repo                 | Repository: Metadata                             |
| SAML SSO Users ( ** )  | read:org             | Organization: Administration                     |
| Secret Scanning Alerts | repo                 | Repository: Metadata & Secret Scanning Alerts    |
| Tags                   | repo                 | Repository: Metadata                             |
| Teams                  | read:org             | Organization: Members                            |
| Team Memberships       | read:org             | Organization: Members                            |
| Users                  | read:org & read:user | Organization: Members                            |
| Workflows              | repo                 | Repository: Metadata & Actions                   |
| Workflow Jobs          | repo                 | Repository: Metadata & Actions                   |
| Workflow Runs          | repo                 | Repository: Metadata & Actions                   |
