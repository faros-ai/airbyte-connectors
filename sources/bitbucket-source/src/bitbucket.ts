import {Bitbucket} from 'bitbucket';
import {APIClient} from 'bitbucket/src/client/types';
import {PaginatedResponseData} from 'bitbucket/src/request/types';
import Bottleneck from 'bottleneck';
import {AirbyteConfig} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';
import {VError} from 'verror';

export interface BitbucketConfig extends AirbyteConfig {
  readonly workspace?: ReadonlyArray<string>;
  readonly repoList?: ReadonlyArray<string>;
  readonly username: string;
  readonly password: string;
  readonly token: string;
  readonly pageSize: number;
}

export interface Repository {
  readonly scm: string;
  readonly website: string;
  readonly hasWiki: boolean;
  readonly uuid: string;
  readonly links: {
    readonly branchesUrl: string;
    readonly htmlUrl: string;
  };
  readonly forkPolicy: string;
  readonly fullName: string;
  readonly name: string;
  readonly project: {
    readonly type: string;
    readonly name: string;
    readonly key: string;
    readonly uuid: string;
    readonly links: {readonly htmlUrl: string};
  };
  readonly language: string;
  readonly createdOn: string;
  readonly mainBranch: {
    readonly type: string;
    readonly name: string;
  };
  readonly workspace: {
    readonly slug: string;
    readonly type: string;
    readonly name: string;
    readonly uuid: string;
    readonly links: {readonly htmlUrl: string};
  };
  readonly hasIssues: boolean;
  readonly owner: {
    readonly username: string;
    readonly displayName: string;
    readonly type: string;
    readonly uuid: string;
    readonly links: {readonly htmlUrl: string};
  };
  readonly updatedOn: string;
  readonly size: number;
  readonly type: string;
  readonly slug: string;
  readonly isPrivate: boolean;
  readonly description: string;
}

export interface Workspace {
  readonly uuid: string;
  readonly createdOn: string;
  readonly type: string;
  readonly slug: string;
  readonly isPrivate: boolean;
  readonly name: string;
  readonly links: {
    readonly ownersUrl: string;
    readonly repositoriesUrl: string;
    readonly htmlUrl: string;
  };
}

export async function createClient(
  config: AirbyteConfig
): Promise<[BitbucketClient, string]> {
  const [passed, errorMessage] = isValidateConfig(config);
  if (!passed) {
    return [undefined, errorMessage];
  }

  const auth = config.token
    ? {token: config.token}
    : {username: config.username, password: config.password};

  try {
    const client = Bitbucket({baseUrl: config.service_url, auth});
    await client.users.getAuthedUser({});
    return [new BitbucketClient(client), null];
  } catch (error) {
    return [undefined, 'Invalid credentials provided'];
  }
}

function isValidateConfig(config: AirbyteConfig): [boolean, string] {
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
    new URL(config.server_url);
  } catch (error) {
    return [false, 'server_url: must be a valid url'];
  }

  return [true, undefined];
}

function buildInnerError(err: any): Error {
  const {message, error, status} = err;
  return new VError({info: {status, error: error?.error?.message}}, message);
}

export const DEFAULT_LIMITER = new Bottleneck({maxConcurrent: 5, minTime: 100});

export class BitbucketClient {
  private readonly limiter = DEFAULT_LIMITER;

  constructor(public readonly client: APIClient) {}

  async getWorkspace(workspace: string): Promise<Workspace | undefined> {
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

  async *getRepositories(
    workspace: string
  ): AsyncGenerator<Repository | undefined> {
    try {
      let {data} = await this.limiter.schedule(() =>
        this.client.repositories.list({workspace})
      );

      do {
        for (const item of data.values) {
          yield this.buildRepository(item);
        }

        data = await this.nextPage(data);
      } while (data);
    } catch (err) {
      throw new VError(
        buildInnerError(err),
        'Error fetching workspace %s',
        workspace
      );
    }
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
