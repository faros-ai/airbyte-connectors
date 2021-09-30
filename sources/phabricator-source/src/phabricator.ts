import {Condoit} from 'condoit';
import iDiffusion from 'condoit/dist/interfaces/iDiffusion';
import {ErrorCodes, phid} from 'condoit/dist/interfaces/iGlobal';
import {AirbyteLogger} from 'faros-airbyte-cdk';
import {trim, uniq} from 'lodash';
import moment, {Moment} from 'moment';
import {Dictionary} from 'ts-essentials';
import {VError} from 'verror';

export const PHABRICATOR_DEFAULT_LIMIT = 100;

export interface PhabricatorConfig {
  readonly server_url: string;
  readonly token: string;
  readonly start_date: string;
  readonly repositories: string;
  readonly limit: number;
}

export type Repository = iDiffusion.retDiffusionRepositorySearchData;

interface PagedResult<T> extends ErrorCodes {
  result: {
    data: Array<T>;
    cursor: {
      limit: number;
      after: string;
      before: any;
      order: any;
    };
  };
}

export interface Commit {
  fields: {
    identifier: string;
    repositoryPHID: phid;
    repository?: Repository; // Added full repository information as well
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
export class Phabricator {
  private static repoCacheById: Dictionary<Repository, phid> = {};
  private static repoCacheByName: Dictionary<Repository, string> = {};

  constructor(
    readonly client: Condoit,
    readonly startDate: Moment,
    readonly repositories: string[],
    readonly limit: number,
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
    const limit = config.limit ?? PHABRICATOR_DEFAULT_LIMIT;
    const client = new Condoit(config.server_url, config.token);
    try {
      await client.user.whoami();
    } catch (err: any) {
      if (err.error_code || err.error_info) {
        throw new VError(`${err.error_code}: ${err.error_info}`);
      }
      throw new VError(err.message ?? JSON.stringify(err));
    }

    return new Phabricator(client, startDate, repositories, limit, logger);
  }

  private static toStringArray(s: any, sep = ','): string[] {
    if (!s) return [];
    if (Array.isArray(s)) return s;
    return s
      .split(sep)
      .map((v) => trim(v))
      .filter((v) => v.length > 0);
  }

  private async *paginate<T, R>(
    limit: number,
    fetch: (after?: string) => Promise<PagedResult<T>>,
    process: (data: T[]) => Promise<R[]>,
    earlyTermination = true
  ): AsyncGenerator<R, any, any> {
    let after: string = null;
    let res: PagedResult<T> | undefined;
    do {
      res = await fetch(after);
      if (res?.error_code || res?.error_info) {
        throw new VError(`${res?.error_code}: ${res?.error_info}`);
      }
      let count = 0;
      const processed = await process(res?.result?.data ?? []);
      for (const item of processed) {
        if (item) {
          count++;
          yield item;
        }
      }
      if (earlyTermination && count < limit) return;
      after = res?.result?.cursor?.after;
    } while (after);
  }

  async *getRepositories(
    filter: {
      repoIds?: phid[];
      repoNames?: string[];
    },
    createdAt?: number,
    limit = this.limit
  ): AsyncGenerator<Repository, any, any> {
    const created = Math.max(createdAt ?? 0, this.startDate.unix());
    this.logger.debug(`Fetching repositories created since ${created}`);

    const attachments = {projects: false, uris: true, metrics: true};
    let constraints = {};

    if (filter.repoIds?.length > 0 || filter.repoNames?.length > 0) {
      const missing = [];
      const cachedRepos = filter.repoIds
        ? filter.repoIds.flatMap((id) => {
            const res = Phabricator.repoCacheById[id];
            if (!res) missing.push(id);
            return res ? [res] : [];
          })
        : filter.repoNames.flatMap((name) => {
            const res = Phabricator.repoCacheByName[name];
            if (!res) missing.push(name);
            return res ? [res] : [];
          });

      this.logger.debug(
        `Retrieved ${cachedRepos.length} repos from cache (${missing.length} missed)`
      );

      if (missing.length == 0) {
        for (const repo of cachedRepos) {
          yield repo;
        }
        return;
      }
      constraints = filter.repoIds ? {phids: missing} : {shortNames: missing};
    }

    yield* this.paginate(
      limit,
      (after) => {
        return this.client.diffusion.repositorySearch({
          queryKey: 'all',
          order: 'newest',
          constraints,
          attachments,
          limit,
          after,
        });
      },
      async (repos) => {
        const newRepos = repos.filter(
          (repo) => repo.fields.dateCreated > created
        );
        // Cache repositories for other queries
        for (const repo of newRepos) {
          this.logger.debug(
            `Cached repo ${repo.fields.shortName} (${repo.phid})`
          );
          Phabricator.repoCacheById[repo.phid] = repo;
          Phabricator.repoCacheByName[repo.fields.shortName] = repo;
        }
        return newRepos;
      }
    );
  }

  async *getCommits(
    committedAt?: number,
    limit = this.limit
  ): AsyncGenerator<Commit, any, any> {
    const committed = Math.max(committedAt ?? 0, this.startDate.unix());
    this.logger.debug(`Fetching commits committed since ${committedAt}`);

    // Only repository IDs work as constraint filter for commits,
    // therefore we do an extra lookup here
    const repositories = [];
    if (this.repositories.length > 0) {
      const repos = this.getRepositories({repoNames: this.repositories});
      for await (const repo of repos) {
        repositories.push(repo.phid);
      }
    }
    const constraints = {repositories, unreachable: false};
    const attachments = {projects: false, subscribers: false};

    yield* this.paginate(
      limit,
      (after) =>
        this.client.diffusion.commitSearch({
          queryKey: 'all',
          order: 'newest',
          constraints,
          attachments,
          limit,
          after,
        }),
      async (commits) => {
        const newCommits = commits
          .map((commit) => commit as any as Commit)
          .filter((commit) => commit.fields.committer.epoch > committed);

        // Extend commits with full repository information if present
        const newCommitRepoIds = uniq(
          newCommits.map((c) => c.fields.repositoryPHID)
        );
        const newCommitRepos: Dictionary<Repository> = {};
        const repos = this.getRepositories({repoIds: newCommitRepoIds});
        for await (const repo of repos) {
          newCommitRepos[repo.phid] = repo;
        }
        return newCommits.map((commit) => {
          commit.fields.repository =
            newCommitRepos[commit.fields.repositoryPHID];
          return commit;
        });
      }
    );
  }
}
