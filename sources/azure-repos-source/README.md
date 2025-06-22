# Azure-Repos Source

This is the repository for the Azure-Repos source connector, written in Typescript.
See [Common Development Instructions for Source Connectors](../README.md#common-development-instructions-for-source-connectors) for setting up your development environment.


#### Required Permissions

The Azure-Repos source connector requires the following permissions:

- vso.code,vso.profile,vso.project


### Streams

| Name     | Full | Incremental | Required Permissions |
|-----------|---|---|---|
| Commits | ✅ | ✅ | vso.code,vso.profile,vso.project |
| Pull Requests | ✅ | ✅ | vso.code,vso.profile,vso.project |
| Repositories | ✅ |  | vso.code,vso.profile,vso.project |
| Users     | ✅ |   | Cloud - vso.graph / Server - vso.profile,vso.project |

