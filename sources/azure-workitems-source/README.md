# Azure Workitems Source

This source streams data from the [Azure DevOps APIs](https://learn.microsoft.com/en-us/rest/api/azure/devops/) using the [Azure DevOps Node.js API client](https://www.npmjs.com/package/azure-devops-node-api).

See [Common Development Instructions for Source Connectors](../README.md#common-development-instructions-for-source-connectors) for setting up your development environment.

## Streams

| Name     | Full | Incremental | Required Permissions |
|-----------|---|---|---|
| Projects  | ✅ |  | vso.profile,vso.project |
| Iterations | ✅ |  | vso.work |
| Workitems | ✅ | ✅ | vso.work  |
| Users     | ✅ |   | Cloud - vso.graph / Server - vso.profile,vso.project |

## Testing

From the Azure Workitems source directory execute:

```sh
$ npm t
```

