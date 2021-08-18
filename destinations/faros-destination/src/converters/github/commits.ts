import {AirbyteRecord} from 'cdk';
import {Dictionary} from 'ts-essentials';

import {Converter, Converts} from '../converter';

@Converts('github_commits', ['vcs_Commit'])
export class GithubCommits implements Converter {
  convert(record: AirbyteRecord): ReadonlyArray<Dictionary<any>> {
    return [];
  }
}
