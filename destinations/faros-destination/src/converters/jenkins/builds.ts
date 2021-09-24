import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {JenkinsCommon, JenkinsConverter} from './common';

export class JenkinsBuilds extends JenkinsConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Organization',
    'cicd_Pipeline',
    'cicd_Build'
  ];

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    const source = this.streamName.source;
    const build = record.record.data;
    const jenkinsUrl = JenkinsCommon.parseJenkinsUrl(build.url);
    if (!jenkinsUrl) return [];
    const organization = JenkinsCommon.cicd_Organization(jenkinsUrl, source);
    const orgKey = {uid: organization.record.uid, source};

    const jobFullName = build.fullDisplayName.replace(/ #.*/, '');
    const job = {
      fullName: jobFullName,
      name: jobFullName,
      url: build.url.replace(/[^/]*\/$/, '')
    }
    const pipeline = JenkinsCommon.cicd_Pipeline(job, orgKey);
    const buildRecord = {
      model: 'cicd_Build',
      record: {
        uid: build.id,
        name: build.displayName,
        number: build.number,
        startedAt: Utils.toDate(build.timestamp),
        endedAt: Utils.toDate(build.timestamp + build.duration),
        status: this.convertBuildStatus(build.result),
        url: build.url,
        pipeline: {
          uid: pipeline.record.uid,
          organization: orgKey,
        },
      },
    }

    return [organization, pipeline, buildRecord];
  }
  
  private convertBuildStatus(status: string | undefined): {
    category: string;
    detail: string;
  } {
    if (!status) {
      return {category: 'Unknown', detail: 'undefined'};
    }
    const detail = status.toLowerCase();
  
    // Read more on Jenkins build results:
    // 1. https://wiki.jenkins.io/display/jenkins/terminology
    // 2. https://github.com/jenkinsci/jenkins/blob/master/core/src/main/java/hudson/model/Result.java
    switch (detail) {
      case 'not_built':
      case 'aborted':
        return {category: 'Canceled', detail};
      case 'failure':
      case 'unstable':
        return {category: 'Failed', detail};
      case 'success':
        return {category: 'Success', detail};
      default:
        return {category: 'Unknown', detail};
    }
  }
}
