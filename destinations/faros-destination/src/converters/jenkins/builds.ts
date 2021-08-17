import {Dictionary} from 'ts-essentials';

import {Converter, Converts} from '../converter';

@Converts('jenkins_builds', 'cicd_Build')
export class GithubCommits implements Converter {
  convert(record: Dictionary<any>): ReadonlyArray<Dictionary<any>> {
    return [];
  }
}
