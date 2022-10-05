import {URL} from 'url';

import {Converter, DestinationRecord, StreamContext} from '../converter';

interface JenkinsUrl {
  hostname: string;
  url: string;
  baseUrl: string;
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
export enum RepoSource {
  BITBUCKET = 'Bitbucket',
  GITHUB = 'GitHub',
  GITLAB = 'GitLab',
  VCS = 'VCS',
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
        uid: jenkinsUrl.hostname.toLowerCase(),
        name: jenkinsUrl.hostname,
        url: jenkinsUrl.baseUrl,
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
        uid: job.fullName.toLowerCase(),
        name: job.name,
        url: job.url,
        organization,
      },
    };
  }

  static parseJenkinsUrl(initUrl: string): undefined | JenkinsUrl {
    try {
      const urlParsed = new URL(initUrl);
      const hostname = urlParsed.hostname;
      const url = urlParsed.toString();
      urlParsed.pathname = '';
      const baseUrl = urlParsed.toString();
      if (!hostname) {
        return undefined;
      }
      return {hostname, url, baseUrl};
    } catch (error) {
      return undefined;
    }
  }
}

interface JenkinsConfig {
  create_commit_records?: boolean;
}

export abstract class JenkinsConverter extends Converter {
  source = 'Jenkins';

  protected jenkinsConfig(ctx: StreamContext): JenkinsConfig {
    return ctx.config?.source_specific_configs?.jenkins;
  }

  protected shouldCreateCommitRecords(ctx: StreamContext): boolean {
    return this.jenkinsConfig(ctx)?.create_commit_records ?? false;
  }
}
