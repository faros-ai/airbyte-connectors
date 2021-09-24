import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {JenkinsCommon, JenkinsConverter} from './common';

export class JenkinsJobs extends JenkinsConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Organization',
    'cicd_Pipeline',
  ];

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    const source = this.streamName.source;
    const job = record.record.data;
    const jenkinsUrl = JenkinsCommon.parseJenkinsUrl(job.url);
    if (!jenkinsUrl) return [];
    const organization = JenkinsCommon.cicd_Organization(jenkinsUrl, source);
    const orgKey = {uid: organization.record.uid, source}
    const pipeline = JenkinsCommon.cicd_Pipeline(job, orgKey);

    return [organization, pipeline];
  }
}
