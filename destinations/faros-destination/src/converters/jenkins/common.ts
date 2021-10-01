import {toLower} from 'lodash';
import {URL} from 'url';

import {DestinationRecord} from '../converter';

interface JenkinsUrl {
  hostname: string;
  url: string;
}

export interface Job {
  readonly fullName: string;
  readonly name: string;
  readonly url: string;
}

interface OrganizationKey {
  uid: string;
  source: string;
}

/** Common functions shares across Jenkins converters */
export class JenkinsCommon {
  static cicd_Organization(
    jenkinsUrl: JenkinsUrl,
    source: string
  ): DestinationRecord {
    return {
      model: 'cicd_Organization',
      record: {
        uid: toLower(jenkinsUrl.hostname),
        name: jenkinsUrl.hostname,
        url: jenkinsUrl.url,
        source,
      },
    };
  }
  static cicd_Pipeline(
    job: Job,
    organization: OrganizationKey
  ): DestinationRecord {
    return {
      model: 'cicd_Pipeline',
      record: {
        uid: toLower(job.fullName),
        name: job.name,
        url: job.url,
        organization,
      },
    };
  }

  static parseJenkinsUrl(initUrl: string): undefined | JenkinsUrl {
    try {
      const jenkinsUrl = new URL(initUrl);
      jenkinsUrl.pathname = '';
      return {
        hostname: jenkinsUrl.hostname,
        url: jenkinsUrl.toString(),
      };
    } catch (error) {
      return undefined;
    }
  }
}
