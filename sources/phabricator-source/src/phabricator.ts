import {Condoit} from 'condoit';
import iDiffusion from 'condoit/dist/interfaces/iDiffusion';
import {phid} from 'condoit/dist/interfaces/iGlobal';
import {AirbyteLogger} from 'faros-airbyte-cdk';
import _ from 'lodash';
import moment, {Moment} from 'moment';
import {VError} from 'verror';

export interface PhabricatorConfig {
  readonly server_url: string;
  readonly token: string;
  readonly start_date: string;
  readonly repositories: string;
}

export type Repository = iDiffusion.retDiffusionRepositorySearchData;
export interface Commit {
  fields: {
    identifier: string;
    repositoryPHID: phid;
    author: {
      name: string;
      email: string;
      raw: string;
      epoch: number;
      identityPHID: phid;
      userPHID: phid;
    };
    // 'committer' is mispelled as 'commiter' in the original library
    //  so I had to copy the type here until fixed -
    // https://github.com/securisec/condoit/issues/8
    committer: {
      name: string;
      email: string;
      raw: string;
      epoch: number;
      identityPHID: phid;
      userPHID: phid;
    };
    isImported: boolean;
    isUnreachable: boolean;
    auditStatus: {
      value: string;
      name: string;
      closed: boolean;
      'color.ansi': string;
    };
    message: string;
    policy: {
      view: string;
      edit: string;
    };
  };
  attachments: {
    subscribers: {
      subscriberPHIDs: Array<phid>;
      subscriberCount: number;
      viewerIsSubscribed: boolean;
    };
    projects: {
      projectPHIDs: Array<phid>;
    };
  };
}
type RepositorySearchResult = iDiffusion.RetDiffusionRepositorySearch;
type CommitSearchResult = iDiffusion.RetDiffusionCommitSearch;

export class Phabricator {
  constructor(
    readonly client: Condoit,
    readonly startDate: Moment,
    readonly repositories: string[],
    readonly logger: AirbyteLogger
  ) {}

  static async make(
    config: PhabricatorConfig,
    logger: AirbyteLogger
  ): Promise<Phabricator> {
    if (!config.server_url) {
      throw new VError('server_url is null or empty');
    }
    if (!config.start_date) {
      throw new VError('start_date is null or empty');
    }
    const startDate = moment(config.start_date, moment.ISO_8601, true).utc();
    if (`${startDate.toDate()}` === 'Invalid Date') {
      throw new VError('start_date is invalid: %s', config.start_date);
    }
    const repositories = Phabricator.toStringArray(config.repositories);
    const client = new Condoit(config.server_url, config.token);
    try {
      await client.user.whoami();
    } catch (err: any) {
      if (err.error_code || err.error_info) {
        throw new VError(`${err.error_code}: ${err.error_info}`);
      }
      throw new VError(err.message ?? JSON.stringify(err));
    }

    return new Phabricator(client, startDate, repositories, logger);
  }

  private static toStringArray(s: any, sep = ','): string[] {
    if (!s) return [];
    if (Array.isArray(s)) return s;
    return s
      .split(sep)
      .map(_.trim)
      .filter((v) => v.length > 0);
  }

  async *getRepositories(
    createdAt?: number,
    limit = 100
  ): AsyncGenerator<Repository, any, any> {
    let after: string = null;
    let res: RepositorySearchResult | undefined;
    const created = Math.max(createdAt ?? 0, this.startDate.unix());
    this.logger.debug(`Fetching repositories created since ${created}`);
    do {
      res = await this.client.diffusion.repositorySearch({
        queryKey: 'all',
        order: 'newest',
        constraints: {
          shortNames: this.repositories,
        },
        attachments: {
          projects: false,
          uris: true,
          metrics: true,
        },
        limit,
        after,
      });
      after = res.result.cursor.after;
      if (res.error_code || res.error_info) {
        throw new VError(`${res.error_code}: ${res.error_info}`);
      }
      let count = 0;
      for (const repo of res.result.data) {
        if (repo.fields.dateCreated >= created) {
          count++;
          yield repo;
        }
      }
      if (count < limit) return;
    } while (after);
  }

  async *getCommits(
    commitedAt?: number,
    limit = 100
  ): AsyncGenerator<Commit, any, any> {
    const repositoryIds = [];
    if (this.repositories.length > 0) {
      for await (const repo of this.getRepositories()) {
        repositoryIds.push(repo.phid);
      }
    }
    let after: string = null;
    let res: CommitSearchResult | undefined;
    const commited = Math.max(commitedAt ?? 0, this.startDate.unix());
    this.logger.debug(`Fetching commits since ${commited}`);
    do {
      res = await this.client.diffusion.commitSearch({
        queryKey: 'all',
        order: 'newest',
        constraints: {
          repositories: repositoryIds,
          unreachable: false,
        },
        attachments: {
          projects: false,
          subscribers: false,
        },
        limit,
        after,
      });
      this.logger.debug(JSON.stringify(res.result.data));
      after = res.result.cursor.after;
      if (res.error_code || res.error_info) {
        throw new VError(`${res.error_code}: ${res.error_info}`);
      }
      let count = 0;
      for (const data of res.result.data) {
        const commit = data as any as Commit;
        if (commit.fields.committer.epoch >= commited) {
          count++;
          yield commit;
        }
      }
      if (count < limit) return;
    } while (after);
  }
}
