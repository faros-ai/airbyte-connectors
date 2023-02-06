import {AirbyteRecord} from 'faros-airbyte-cdk';
import _ from 'lodash';

import {Converter, DestinationModel, DestinationRecord} from '../converter';
import {JenkinsCommon} from '../jenkins/common';

export class CollectorItems extends Converter {
  source = 'Hygieia';

  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Organization',
    'cicd_Pipeline',
  ];

  id(record: AirbyteRecord): any {
    return record?.record?.data?.options?.jobUrl;
  }

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    if (
      record?.record?.data?._class !==
      'com.capitalone.dashboard.model.HudsonJob'
    ) {
      return [];
    }

    const job = record.record.data as {
      options?: {
        jobName?: string;
        jobUrl?: string;
        instanceUrl?: string;
      };
    };

    if (_.isNil(job.options?.instanceUrl)) {
      return [];
    }

    const jenkinsUrl = JenkinsCommon.parseJenkinsUrl(job.options?.instanceUrl);
    if (!jenkinsUrl) {
      return [];
    }

    const organization = JenkinsCommon.cicd_Organization(
      jenkinsUrl,
      this.source
    );
    const orgKey = {uid: organization.record.uid, source: this.source};

    if (_.isNil(job.options?.jobName) || _.isNil(job.options?.jobUrl)) {
      return [organization];
    }

    const pipeline = JenkinsCommon.cicd_Pipeline(
      {
        fullName: job.options?.jobName,
        name: job.options?.jobName,
        url: job.options?.jobUrl,
      },
      orgKey
    );

    return [organization, pipeline];
  }
}
