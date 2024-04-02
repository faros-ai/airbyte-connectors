export const vcsRepositoryQuery = `
query MyQuery {
  vcs_Repository(where: {name: {_eq: "<REPONAME>"}}, limit: 1) {
    organization {
      uid
      source
    }
    name
  }
}
`;

export const cicdArtifactQueryByCommitSha = `
query MyQuery {
  cicd_Artifact(where: {uid: {_eq: "<COMMIT_SHA>"}}) {
    uid
    repository {
      organization {
        uid
        source
      }
      uid
    }
  }
}
`;

export const cicdArtifactQueryByRepoName = `
query MyQuery {
  cicd_Artifact(
    where: {repository: {uid: {_eq: "<REPONAME>"}}}
    limit: 1
    order_by: {refreshedAt: asc}
  ) {
    uid
    repository {
      organization {
        uid
        source
      }
      uid
    }
  }
}
`;
