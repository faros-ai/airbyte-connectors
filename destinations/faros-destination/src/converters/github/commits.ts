import {AirbyteRecord} from 'cdk';

import {Converter, Converts, DestinationRecord} from '../converter';

@Converts('github_commits', ['vcs_Commit'])
export class GithubCommits implements Converter {
  convert(record: AirbyteRecord): ReadonlyArray<DestinationRecord> {
    return [];
  }
}
