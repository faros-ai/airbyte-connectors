import {AirbyteRecord} from 'faros-airbyte-cdk/lib';
import {toLower} from 'lodash';
import {Dictionary} from 'ts-essentials';
import {URL} from 'url';

import {Converter, DestinationRecord} from '../converter';

/** Common functions shares across JenkinsC converters */
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
    job: Dictionary<any>,
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

  static parseJenkinsUrl(jenkinsJobUrl: string): undefined | JenkinsUrl {
    try {
      const jenkinsUrl = new URL(jenkinsJobUrl);
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

/** JenkinsC converter base */
export abstract class JenkinsConverter extends Converter {
  /** All Jenkins records should have id property */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }
}

interface JenkinsUrl {
  hostname: string;
  url: string;
}

interface OrganizationKey {
  uid: string;
  source: string;
}
