import {AirbyteRecord} from 'cdk';

import {Converter, Converts} from '../converter';

@Converts('github_commits', 'vcs_Commit')
export class GithubCommits implements Converter {
  convert(record: AirbyteRecord): any {
    throw new Error('Method not implemented.');
  }
}
