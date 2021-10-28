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
export const jiraPGRawLog = readTestResourceFile('jira/pg-raw.log');

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
