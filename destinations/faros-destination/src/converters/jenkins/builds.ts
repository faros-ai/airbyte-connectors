import {AirbyteRecord} from 'cdk';

import {Converter, Converts} from '../converter';

@Converts('jenkins_builds', 'cicd_Build')
export class GithubCommits implements Converter {
  convert(record: AirbyteRecord): any {
    throw new Error('Method not implemented.');
  }
}
