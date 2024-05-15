
Within this connector, we maintain the assumption that the vulnerabilities given to us by 
the vanta source are the current open vulnerabilities. That means any vulnerability that isn't listed
in a record coming from the source is assumed to be resolved or closed. 
After we read and keep all the records from the source in memory, we also query all the 
unresolved vulnerabilities in our faros graph. For every unresolved vulnerability in the faros
graph that isn't listed as an open vulnerability, we add a resolved date to it, thereby updating
the data in the faros graph to represent the state of vulnerabilities. Note that an unresolved
vulnerability is simply one for which the 'resolvedAt' field is null.


- Notes on Unit Testing
  For vanta source unit testing there needs to be a relation between the input streams (streams.log, streams2.log, etc)
  and the query responses (mockQueryNamesToObjects.json). The queries search the Faros DB for objects with specific
  properties - for example, in the vcs_Repository query, we have:

```gql
query vcsRepositoryQuery($vcsRepoNames: [String], $limit: Int) {
  vcs_Repository(
    where: {name: {_in: $vcsRepoNames}}
    limit: $limit
    distinct_on: name
  ) {
    organization {
      uid
      source
    }
    name
  }
}
```

This query shows that the returned vcs_Repository objects need to have their names correspond to the
input query names. The vcsRepoNames are constructed out of the "repositoryName" field from the streams
coming from the source.


# The source vanta GraphQL Queries and types (sources/vanta-source/resources/*.gql)

Git:
  uid: String Vanta UID 
  displayName: String of package/lib, e.g. "npm-vm2"
  createdAt: String of Date, e.g. "2024-05-04T08:02:08.691Z"
  externalURL: String of URL linking to github vuln, e.g "https://github.com/org-name/..."
  severity: Number
  repositoryName: The name of the repo, without the org name, e.g. "airbyte-connectors"
  slaDeadline: Optional Date
  securityAdvisory {
      cveId: String, CVE Id
      description: String, text of description
      ghsaId: String, Github Security Advisory Id
  }

Aws (V1):
  uid: String Vanta UID
  displayName: String, combination of packageName and package Version: e.g. "org.yaml:snakeyaml:1.32"
  createdAt: String of Date, e.g. "2024-04-13T07:12:11.033Z"
  externalURL: String of URL, e.g. "https://console.aws.amazon..."
  severity: Number from 0 - 10
  packageName: String of package/library, e.g. "org.yaml:snakeyaml"
  packageVersion: String version number, e.g. "1.32"
  slaDeadline: Optional String of Date
  repositoryName: String, name of repository as in AWS, e.g. "docker/..."
  repositoryArn: String, AWS arn, e.g. "arn:aws:ecr:us-east-1:<id>:repository/docker/..."
  findings {
    description: String (long text block of description)
    providerSeverity: number
    name: String  - CVE string plus package name, e.g. "CVE-2022-1471 - org.yaml:snakeyaml"
  }

Aws V2:
  uid: String: Vanta UID
  displayName: String: packageIdentifier + "/" + CVE ID, e.g. "curl:8.3.0/CVE-2024-2004"
  createdAt: String of date, e.g. 2024-05-01T19:52:40.345Z
  externalURL: String: url pointing to repository in AWS, e.g. https://console.aws
  severity: String: one of "HIGH", "MEDIUM", "LOW", "CRITICAL"
  packageName: String: name of the package with the vulnerability, e.g. "curl", or "libnghttp2"
  packageIdentifier: String: Package name plus version, e.g. curl:8.3.0
  description: String: Long text description of the vulnerability
  name: Another text description
  isFixable: boolean
  remediateBy: String of due date, e.g. "2024-06-01T13:56:08.220Z"
  asset {
    displayName: String: Name of the container 
  }
  ignored (Optional) {
    ignoreReason: String, e.g. "Fix not yet available"
    ignoredUntil: Optional String of Date
    ignoredAt: String of Date
  }
  imageTags: List of imageTags, each a string, e.g. 98c... (often an empty list) 
  imageDigest: String
