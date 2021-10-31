import {Bitbucket} from 'bitbucket';
import {APIClient} from 'bitbucket/src/client/types';
import {PaginatedResponseData} from 'bitbucket/src/request/types';
import Bottleneck from 'bottleneck';
import {Dictionary} from 'ts-essentials';
import {VError} from 'verror';

import {BitbucketConfig, Branch, Repository, Workspace} from './types';

export const DEFAULT_LIMITER = new Bottleneck({maxConcurrent: 5, minTime: 100});

function buildInnerError(err: any): Error {
  const {message, error, status} = err;
  return new VError({info: {status, error: error?.error?.message}}, message);
}

export async function createClient(
  config: BitbucketConfig
): Promise<[BitbucketClient, string]> {
  const [passed, errorMessage] = isValidateConfig(config);
  if (!passed) {
    return [undefined, errorMessage];
  }

  const auth = config.token
    ? {token: config.token}
    : {username: config.username, password: config.password};

  try {
    const client = Bitbucket({baseUrl: config.serverUrl, auth});
    await client.users.getAuthedUser({});
    return [new BitbucketClient(client), null];
  } catch (error) {
    return [undefined, 'Invalid credentials provided'];
  }
}

function isValidateConfig(config: BitbucketConfig): [boolean, string] {
  if (
    (config.token && config.username && config.password) ||
    (config.token && (config.username || config.password)) ||
    (!config.token && (!config.username || !config.password))
  ) {
    return [
      false,
      'Invalid authentication details. Please provide either only the ' +
        'Bitbucket access token or Bitbucket username and password',
    ];
  }

  if (!config.workspace) {
    return [false, 'No workspace provided'];
  }

  try {
    new URL(config.serverUrl);
  } catch (error) {
    return [false, 'server_url: must be a valid url'];
  }

  return [true, undefined];
}

export class BitbucketClient {
  private readonly limiter = DEFAULT_LIMITER;

  constructor(public readonly client: APIClient) {}

  async *getBranches(
    workspace: string,
    repo_slug: string
  ): AsyncGenerator<Branch> {
    try {
      let {data} = await this.limiter.schedule(() =>
        this.client.repositories.listBranches({
          workspace,
          repo_slug,
          pagelen: 100, // TODO: use var
        })
      );

      do {
        for (const item of data.values) {
          yield this.buildBranch(item);
        }

        data = await this.nextPage(data);
      } while (data);
    } catch (err) {
      throw new VError(
        buildInnerError(err),
        'Error fetching branch(es) for repository "%s/%s"',
        workspace,
        repo_slug
      );
    }
  }

  async getRepository(
    workspace: string,
    repo_slug: string
  ): Promise<Repository> {
    try {
      const {data} = await this.limiter.schedule(() =>
        this.client.repositories.get({workspace, repo_slug})
      );

      return this.buildRepository(data);
    } catch (err) {
      throw new VError(
        buildInnerError(err),
        'Error fetching workspace %s.',
        workspace
      );
    }
  }

  async getWorkspace(workspace: string): Promise<Workspace> {
    try {
      const {data} = await this.limiter.schedule(() =>
        this.client.workspaces.getWorkspace({workspace})
      );

      return {
        uuid: data.uuid,
        createdOn: data.created_on,
        type: data.type,
        slug: data.slug,
        isPrivate: data.is_private,
        name: data.name,
        links: {
          ownersUrl: data.links?.owners?.href,
          repositoriesUrl: data.links?.repositories?.href,
          htmlUrl: data.links?.html?.href,
        },
      };
    } catch (err) {
      throw new VError(
        buildInnerError(err),
        'Error fetching workspace %s',
        workspace
      );
    }
  }

  private buildBranch(data: Dictionary<any>): Branch {
    const {
      target,
      target: {author, parents, repository: repo},
    } = data;

    return {
      name: data.name,
      links: {htmlUrl: data.links?.html?.href},
      defaultMergeStrategy: data.default_merge_strategy,
      mergeStrategies: data.merge_strategies,
      type: data.type,
      target: {
        hash: target.hash,
        repository: {
          links: {htmlUrl: repo.links?.html?.href},
          type: repo.type,
          name: repo.name,
          fullName: repo.full_name,
          uuid: repo.uuid,
        },
        links: {htmlUrl: target.links?.html?.href},
        author: {
          raw: author.raw,
          type: author.type,
          user: {
            displayName: author.user.display_name,
            uuid: author.user.uuid,
            links: {htmlUrl: author.user.links?.html?.href},
            type: author.user.type,
            nickname: author.user.nickname,
            accountId: author.user.account_id,
          },
        },
        parents: parents.map((parent) => ({
          hash: parent.hash,
          links: {htmlUrl: parent.links?.html?.href},
        })),
        date: target.date,
        message: target.message,
        type: target.type,
      },
    };
  }

  private buildRepository(data: Dictionary<any>): Repository {
    const {owner, project, workspace} = data;
    return {
      scm: data.scm,
      website: data.website,
      hasWiki: data.has_wiki,
      uuid: data.uuid,
      links: {
        branchesUrl: data.links?.branches?.href,
        htmlUrl: data.links?.html?.href,
      },
      forkPolicy: data.fork_policy,
      fullName: data.full_name,
      name: data.name,
      project: {
        links: {htmlUrl: project.links?.html?.href},
        type: project.type,
        name: project.name,
        key: project.key,
        uuid: project.uuid,
      },
      language: data.language,
      createdOn: data.created_on,
      mainBranch: {
        type: data.mainbranch.type,
        name: data.mainbranch.name,
      },
      workspace: {
        slug: project.slug,
        type: project.type,
        name: project.name,
        links: {htmlUrl: workspace.links?.html?.href},
        uuid: project.uuid,
      },
      hasIssues: data.has_issues,
      owner: {
        username: owner.username,
        displayName: owner.display_name,
        type: owner.type,
        uuid: owner.uuid,
        links: {htmlUrl: owner.links?.html?.href},
      },
      updatedOn: data.updated_on,
      size: data.size,
      type: data.type,
      slug: data.slug,
      isPrivate: data.is_private,
      description: data.description,
    };
  }

  private async nextPage<T>(
    currentData: PaginatedResponseData<any>
  ): Promise<T | undefined> {
    if (!this.client.hasNextPage(currentData)) {
      return;
    }

    const {data} = await this.limiter.schedule(() =>
      this.client.getNextPage(currentData)
    );
    return data;
  }
}
