import Axios, {AxiosInstance} from 'axios';
import {Condoit} from 'condoit';
import {DiffDiffSearch} from 'condoit/dist/interfaces/iDifferential';
import iDiffusion from 'condoit/dist/interfaces/iDiffusion';
import {
  ErrorCodes,
  phid,
  RetSearchConstants,
} from 'condoit/dist/interfaces/iGlobal';
import iProject from 'condoit/dist/interfaces/iProject';
import iTransactions from 'condoit/dist/interfaces/iTransactions';
import iUser from 'condoit/dist/interfaces/iUser';
import {AirbyteLogger} from 'faros-airbyte-cdk';
import {chunk, floor, pick, trim, uniq} from 'lodash';
import {DateTime} from 'luxon';
import parseDiff from 'parse-diff';
import {Dictionary} from 'ts-essentials';
import {Memoize} from 'typescript-memoize';
import {VError} from 'verror';

export const PHABRICATOR_DEFAULT_LIMIT = 100;
export const PHABRICATOR_DEFAULT_TIMEOUT = 60000;

export interface PhabricatorConfig {
  readonly server_url: string;
  readonly token: string;
  readonly cutoff_days: number;
  readonly repositories?: string | string[];
  readonly projects?: string | string[];
  readonly limit?: number;
  readonly timeout?: number;
}

export type Repository = iDiffusion.retDiffusionRepositorySearchData;
export type RepositoryShort = RetSearchConstants & {
  fields: {
    name: string;
    shortName?: string;
    callsign?: string;
  };
};
export interface Commit extends iDiffusion.retDiffusionCommitSearchData {
  repository?: RepositoryShort;
}
export type User = iUser.retUsersSearchData;
export type Project = iProject.retProjectSearchData;
export interface Revision extends RetSearchConstants {
  repository?: RepositoryShort;
  fields: {
    title: string;
    uri: string;
    authorPHID: string;
    status: {
      value: string;
      name: string;
      closed: boolean;
      'color.ansi': string;
    };
    repositoryPHID: string;
    diffPHID: string;
    summary: string;
    testPlan: string;
    isDraft: boolean;
    holdAsDraft: boolean;
    dateCreated: number;
    dateModified: number;
    policy: {
      view: string;
      edit: string;
    };
  };
  attachments: {
    projects: {
      projectPHIDs: string[];
    };
    subscribers: {
      subscriberPHIDs: string[];
      subscriberCount: number;
      viewerIsSubscribed: boolean;
    };
    reviewers: {
      reviewers: Reviewer[];
    };
  };
}

export type Transaction = iTransactions.retTransactionsSearchData & {
  revision: {
    id: number;
    phid: string;
    dateModified: number;
  };
  repository?: RepositoryShort;
};

export interface Reviewer {
  reviewerPHID: string;
  status: string;
  isBlocking: boolean;
  actorPHID: string;
}

export interface RevisionDiff {
  id: number;
  phid: string;
  revision: {
    id: number;
    phid: string;
    dateModified: number;
  };
  repository?: RepositoryShort;
  files: Pick<
    parseDiff.File,
    'deletions' | 'additions' | 'from' | 'to' | 'deleted' | 'new'
  >[];
}

interface PagedResult<T> extends ErrorCodes {
  result: {
    data: Array<T>;
    cursor: {
      limit: number;
      after: string;
      before: any;
      order?: any;
    };
  };
}

export class Phabricator {
  private static phabricator: Phabricator = null;
  private static repoCacheById: Dictionary<Repository, phid> = {};
  private static repoCacheByName: Dictionary<Repository, string> = {};

  constructor(
    readonly config: PhabricatorConfig,
    readonly axios: AxiosInstance,
    readonly client: Condoit,
    readonly startDate: DateTime,
    readonly repositories: string[],
    readonly projects: string[],
    readonly limit: number,
    readonly logger: AirbyteLogger
  ) {}

  static instance(
    config: PhabricatorConfig,
    logger: AirbyteLogger
  ): Phabricator {
    if (Phabricator.phabricator) return Phabricator.phabricator;

    let baseURL: string;
    if (!config.server_url) {
      throw new VError('server_url is null or empty');
    }
    try {
      baseURL = new URL('/api', config.server_url).toString();
    } catch (e: any) {
      throw new VError(
        `server_url is invalid - ${e.message ?? JSON.stringify(e)}`
      );
    }
    if (!config.cutoff_days) {
      throw new VError('cutoff_days is null or empty');
    }
    const repositories = Phabricator.toStringArray(config.repositories);
    const projects = Phabricator.toStringArray(config.projects);
    const limit =
      config.limit &&
      config.limit > 0 &&
      config.limit <= PHABRICATOR_DEFAULT_LIMIT
        ? config.limit
        : PHABRICATOR_DEFAULT_LIMIT;
    const timeout = config.timeout ?? PHABRICATOR_DEFAULT_TIMEOUT;

    const axios = Axios.create({baseURL, timeout});
    const client = new Condoit(
      config.server_url,
      config.token,
      {},
      axios as any // TODO: figure out how to deal with Axios versions mismatch
    );
    const startDate = DateTime.now().minus({days: config.cutoff_days});
    Phabricator.phabricator = new Phabricator(
      config,
      axios,
      client,
      startDate,
      repositories,
      projects,
      limit,
      logger
    );
    return Phabricator.phabricator;
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
      if (earlyTermination && count < this.limit) return;
      after = res?.result?.cursor?.after;
    } while (after);
  }

  async checkConnection(): Promise<void> {
    try {
      await this.client.user.whoami();
    } catch (err: any) {
      if (err.error_code || err.error_info) {
        throw new VError(`${err.error_code}: ${err.error_info}`);
      }
      throw new VError(err.message ?? JSON.stringify(err));
    }
  }

  async *getRepositories(
    filter: {repoIds?: phid[]; repoNames?: string[]},
    modifiedAt?: number
  ): AsyncGenerator<Repository> {
    const modified = modifiedAt ?? 0;
    this.logger.debug(`Fetching repositories modified since ${modified}`);

    const attachments = {projects: true, uris: true, metrics: true};
    let constraints = {};

    if (filter.repoIds?.length > 0 || filter.repoNames?.length > 0) {
      const missing: string[] = [];
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
      // Return all the cached repositories
      for (const repo of cachedRepos) {
        yield repo;
      }
      // We got all the repos from the cache - nothing left to do
      if (missing.length === 0) return;
      // Fetch missing repos from from the API
      constraints = filter.repoIds ? {phids: missing} : {shortNames: missing};
    }

    yield* this.paginate(
      (after) => {
        return this.client.diffusion.repositorySearch({
          queryKey: 'all',
          order: 'newest',
          constraints,
          attachments,
          limit: this.limit,
          after,
        });
      },
      async (repos) => {
        const newRepos = repos.filter(
          (repo) => repo.fields.dateModified > modified
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
    repoNames: string[],
    committedAt?: number
  ): AsyncGenerator<Commit> {
    const committed = Math.max(
      committedAt ?? 0,
      floor(this.startDate.toSeconds())
    );
    this.logger.debug(`Fetching commits committed since ${committed}`);

    // Only repository IDs work as constraint filter for commits,
    // therefore we do an extra lookup here
    const repositories: phid[] = [];
    if (repoNames.length > 0) {
      const repos = this.getRepositories({repoNames});
      for await (const repo of repos) {
        repositories.push(repo.phid);
      }
    }
    const constraints = {repositories, unreachable: false};
    const attachments = {projects: false, subscribers: false};

    yield* this.paginate(
      (after) =>
        this.client.diffusion.commitSearch({
          queryKey: 'all',
          order: 'newest',
          constraints,
          attachments,
          limit: this.limit,
          after,
        }),
      async (commits) => {
        const newCommits = commits
          .map((commit) => commit as Commit)
          .filter((commit) => commit.fields.committer.epoch > committed);

        // Extend commits with repository information if present
        const repoIds = uniq(newCommits.map((c) => c.fields.repositoryPHID));
        const reposById: Dictionary<Repository> = {};
        const repos = this.getRepositories({repoIds});
        for await (const repo of repos) {
          reposById[repo.phid] = repo;
        }
        return newCommits.map((commit) => {
          const repoId = commit.fields.repositoryPHID;
          const repository = reposById[repoId];
          commit.repository = toRepoShort(repository);
          if (!commit.repository) {
            this.logger.warn(
              `Could not find repository for commit id: ${commit.id}, phid: ${commit.phid}, repo_phid: ${repoId}`
            );
          }
          return commit;
        });
      }
    );
  }

  @Memoize(
    (repoNames: string[], modifiedAt: number) => `${repoNames};${modifiedAt}`
  )
  async getRevisions(
    repoNames: string[],
    modifiedAt?: number
  ): Promise<ReadonlyArray<Revision>> {
    const results: Revision[] = [];
    const modified = Math.max(
      modifiedAt ?? 0,
      floor(this.startDate.toSeconds())
    );
    this.logger.debug(`Fetching revisions modified since ${modified}`);

    // Only repository IDs work as constraint filter for revisions,
    // therefore we do an extra lookup here
    const repositoryPHIDs = [];
    if (repoNames.length > 0) {
      const repos = this.getRepositories({repoNames});
      for await (const repo of repos) {
        repositoryPHIDs.push(repo.phid);
      }
    }

    const constraints = {repositoryPHIDs, modifiedStart: modified};
    const attachments = {projects: true, subscribers: true, reviewers: true};

    const revisions = this.paginate(
      (after) =>
        this.client.differential.revisionSearch({
          queryKey: 'all',
          order: 'updated',
          constraints,
          attachments,
          limit: this.limit,
          after,
        }),
      async (revisions) => {
        const newRevisions = revisions
          .map((revision) => revision as any as Revision)
          .filter((revision) => revision.fields.dateModified > modified);

        // Extend revisions with repository information if present
        const repoIds = uniq(newRevisions.map((c) => c.fields.repositoryPHID));
        const reposById: Dictionary<Repository> = {};
        const repos = this.getRepositories({repoIds});
        for await (const repo of repos) {
          reposById[repo.phid] = repo;
        }
        return newRevisions.map((revision) => {
          const repoId = revision.fields.repositoryPHID;
          const repository = reposById[repoId];
          revision.repository = toRepoShort(repository);
          if (!revision.repository) {
            this.logger.warn(
              `Could not find repository for revision id: ${revision.id}, phid: ${revision.phid}, repo_phid: ${repoId}`
            );
          }
          return revision;
        });
      }
    );
    for await (const revision of revisions) {
      results.push(revision);
    }
    return results;
  }

  async *getRevisionDiffs(
    repoNames: string[],
    modifiedAt?: number
  ): AsyncGenerator<RevisionDiff> {
    const revisions = await this.getRevisions(repoNames, modifiedAt);
    for (const batch of chunk(revisions, this.limit)) {
      const diffsRes = await this.client.differential.diffSearch({
        constraints: {
          phids: batch
            .map((revision) => revision.fields.diffPHID)
            .filter((id) => id),
        },
      } as DiffDiffSearch);
      if (diffsRes?.error_code || diffsRes?.error_info) {
        throw new VError(`${diffsRes?.error_code}: ${diffsRes?.error_info}`);
      }

      for (const diff of diffsRes.result.data) {
        const revision = batch.find((r) => r.phid === diff.fields.revisionPHID);
        if (!revision) {
          this.logger.warn(`Could not determine revision for diff ${diff.id}`);
          continue;
        }
        try {
          const rawDiffRes = await this.client.differential.getrawdiff({
            diffID: `${diff.id}`,
          });
          if (rawDiffRes?.error_code || rawDiffRes?.error_info) {
            throw new VError(
              `${rawDiffRes?.error_code}: ${rawDiffRes?.error_info}`
            );
          }
          if (typeof rawDiffRes.result !== 'string') {
            this.logger.warn(`Unexpected raw diff type for diff ${diff.id}`);
            continue;
          }
          const files = parseDiff(rawDiffRes.result);

          yield {
            id: diff.id,
            phid: diff.phid,
            revision: {
              id: revision.id,
              phid: revision.phid,
              dateModified: revision.fields?.dateModified,
            },
            repository: revision.repository,
            files: files.map((f) =>
              pick(f, 'deletions', 'additions', 'from', 'to', 'deleted', 'new')
            ),
          };
        } catch (err: any) {
          this.logger.error(
            `Failed to parse raw diff for ${revision.phid}: ${JSON.stringify(
              err
            )}`,
            err.stack
          );
        }
      }
    }
  }

  async *getUsers(
    filter: {userIds?: phid[]},
    modifiedAt?: number
  ): AsyncGenerator<User> {
    const modified = modifiedAt ?? 0;
    this.logger.debug(`Fetching users modified since ${modified}`);

    const constraints = {phids: filter.userIds ?? []};

    yield* this.paginate(
      (after) => {
        return this.client.user.search({
          queryKey: 'all',
          order: 'newest',
          constraints,
          limit: this.limit,
          after,
        });
      },
      async (users) => {
        const newUsers = users.filter(
          (user) => user.fields.dateModified > modified
        );
        return newUsers;
      }
    );
  }

  async *getProjects(
    filter: {slugs?: string[]},
    modifiedAt?: number
  ): AsyncGenerator<Project> {
    const modified = modifiedAt ?? 0;
    this.logger.debug(`Fetching projects modified since ${modified}`);

    const constraints = {slugs: filter.slugs ?? []};
    const attachments = {members: true, ancestors: true, watchers: true};

    yield* this.paginate(
      (after) => {
        return this.client.project.search({
          queryKey: 'all',
          order: 'newest' as any,
          constraints,
          attachments,
          limit: this.limit,
          after,
        });
      },
      async (projects) => {
        const newProjects = projects.filter(
          (project) => project.fields.dateModified > modified
        );
        return newProjects;
      }
    );
  }

  async *getRevisionsTransactions(
    repoNames: string[],
    modifiedAt?: number
  ): AsyncGenerator<Transaction> {
    const revisions = await this.getRevisions(repoNames, modifiedAt);

    for (const revision of revisions) {
      yield* this.paginate(
        (after) => {
          const params = {
            objectIdentifier: revision.phid,
            limit: this.limit,
            after,
            constraints: undefined,
          };
          return this.client.transaction.search(params);
        },
        async (transactions) => {
          const newTransactions = transactions.map((transaction) => {
            return {
              ...transaction,
              revision: {
                id: revision.id,
                phid: revision.phid,
                dateModified: revision.fields?.dateModified,
              },
              repository: revision.repository,
            };
          });
          return newTransactions;
        }
      );
    }
  }
}

function toRepoShort(
  repo?: Repository | RepositoryShort
): RepositoryShort | undefined {
  if (!repo) return undefined;
  return {
    id: repo.id,
    phid: repo.phid,
    type: repo.type,
    fields: {
      name: repo.fields?.name,
      shortName: repo.fields?.shortName,
      callsign: repo.fields?.callsign,
    },
  };
}
