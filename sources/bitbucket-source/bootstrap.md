## Streams

Bitbucket is a REST API. This connector has the following streams:

* [Branches](https://bitbucketjs.netlify.app/#api-repositories-repositories_listBranches)
* [Commits](https://bitbucketjs.netlify.app/#api-repositories-repositories_listCommits) \(Incremental\)
* [Deployments](https://bitbucketjs.netlify.app/#api-deployments-deployments_list)
* [Environments](https://bitbucketjs.netlify.app/#api-deployments-deployments_listEnvironments)
* [Issues](https://bitbucketjs.netlify.app/#api-repositories-repositories_listIssues) \(Incremental\)
* [PipelineSteps](https://bitbucketjs.netlify.app/#api-pipelines-pipelines_listSteps) \(Incremental\)
* [Pipelines](https://bitbucketjs.netlify.app/#api-pipelines-pipelines_list)
* [PullRequestActivities](https://bitbucketjs.netlify.app/#api-repositories-repositories_listPullRequestActivities)
* [PullRequests](https://bitbucketjs.netlify.app/#api-repositories-repositories_listPullRequests) \(Incremental\)
* [Repositories](https://bitbucketjs.netlify.app/#api-repositories-repositories_list) \(Incremental\)
* [WorkspaceUsers](https://bitbucketjs.netlify.app/#api-workspaces-workspaces_getMembersForWorkspace)
* [Workspaces](https://bitbucketjs.netlify.app/#api-workspaces-workspaces_getWorkspaces)

Authorization using username/password: use your email address to username and [App password](https://bitbucket.org/account/settings/app-passwords/) to password. See [here](https://bitbucketjs.netlify.app/) for API
documentation.
