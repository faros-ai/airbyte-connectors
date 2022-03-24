import fs from 'fs-extra';

export function readTestResourceFile(fileName: string): string {
  return fs.readFileSync(`test/resources/${fileName}`, 'utf8');
}

export const githubLog = readTestResourceFile('github/streams.log');
export const githubPGRawLog = readTestResourceFile('github/pg-raw.log');
export const githubAllStreamsLog = readTestResourceFile(
  'github/all-streams.log'
);

export const jenkinsLog = readTestResourceFile('jenkins/streams.log');
export const jenkinsAllStreamsLog = readTestResourceFile(
  'jenkins/all-streams.log'
);

export const jiraAllStreamsLog = readTestResourceFile('jira/all-streams.log');

export const asanaLog = readTestResourceFile('asana/streams.log');
export const asanaPGRawLog = readTestResourceFile('asana/pg-raw.log');
export const asanaAllStreamsLog = readTestResourceFile('asana/all-streams.log');

export const gitlabLog = readTestResourceFile('gitlab/streams.log');
export const gitlabPGRawLog = readTestResourceFile('gitlab/pg-raw.log');
export const gitlabAllStreamsLog = readTestResourceFile(
  'gitlab/all-streams.log'
);

export const phabricatorAllStreamsLog = readTestResourceFile(
  'phabricator/all-streams.log'
);

export const bitbucketAllStreamsLog = readTestResourceFile(
  'bitbucket/all-streams.log'
);
export const dockerAllStreamsLog = readTestResourceFile(
  'docker/all-streams.log'
);
export const statuspageAllStreamsLog = readTestResourceFile(
  'statuspage/all-streams.log'
);

export const victoropsAllStreamsLog = readTestResourceFile(
  'victorops/all-streams.log'
);

export const harnessAllStreamsLog = readTestResourceFile(
  'harness/all-streams.log'
);

export const pagerdutyLog = readTestResourceFile('pagerduty/streams.log');

export const squadcastAllStreamsLog = readTestResourceFile(
  'squadcast/all-streams.log'
);

export const shortcutAllStreamsLog = readTestResourceFile(
  'shortcut/all-streams.log'
);

export const googlecalendarAllStreamsLog = readTestResourceFile(
  'googlecalendar/all-streams.log'
);

export const backlogAllStreamsLog = readTestResourceFile(
  'backlog/all-streams.log'
);

export const oktaAllStreamsLog = readTestResourceFile('okta/all-streams.log');

export const agileacceleratorAllStreamsLog = readTestResourceFile(
  'agileaccelerator/all-streams.log'
);

export const datadogAllStreamsLog = readTestResourceFile(
  'datadog/all-streams.log'
);

export const firehydrantAllStreamsLog = readTestResourceFile(
  'firehydrant/all-streams.log'
);
export const azureactivedirectoryAllStreamsLog = readTestResourceFile(
  'azureactivedirectory/all-streams.log'
);
