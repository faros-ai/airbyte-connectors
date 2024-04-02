// Note the queries must have a single set of double quotes surrounding
// the object of interest in order for the unit tests to work.

export const vcsRepositoryQuery = `
query vcsRepositoryQuery {
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
query cicdArtifactQueryByCommitSha {
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
query cicdArtifactQueryByRepoName {
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
