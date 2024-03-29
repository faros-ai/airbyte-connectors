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

export const cicdArtifactQuery = `
query MyQuery {
  cicd_Artifact(where: {repository: {uid: {_eq: "<REPONAME>"}}}, limit: 1) {
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
