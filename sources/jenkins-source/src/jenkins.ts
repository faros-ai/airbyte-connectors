import {AirbyteConfig, AirbyteLogger} from 'faros-airbyte-cdk';
import jenkinsClient from 'jenkins';
import {Memoize} from 'typescript-memoize';
import {URL} from 'url';
import util from 'util';
import {VError} from 'verror';

const DEFAULT_PAGE_SIZE = 10;
const FEED_ALL_FIELDS_PATTERN = `name,fullName,url,nextBuildNumber,lastCompletedBuild[number],%s[id,displayName,number,building,description,result,timestamp,duration,url,actions[lastBuiltRevision[SHA1],remoteUrls],fullName,fullDisplayName],jobs[*]`;
const FEED_JOBS_COUNT_PATTERN = 'jobs[name]';
const FEED_MAX_DEPTH_CALC_PATTERN = 'fullName,nextBuildNumber,jobs[*]';
const POTENTIAL_MAX_DEPTH = 10;

export interface JenkinsConfig extends AirbyteConfig {
  readonly server_url: string;
  readonly user?: string;
  readonly token?: string;
  readonly depth?: number;
  readonly pageSize?: number;
  readonly last100Builds?: boolean;
}

export interface Job {
  _class: string;
  fullName: string;
  name: string;
  url: string;
  allBuilds?: Build[];
  builds?: Build[];
  nextBuildNumber?: number;
  lastCompletedBuild: Build | null;
  jobs?: Job[];
}

export interface Build {
  _class: string;
  actions: any[];
  building: boolean;
  displayName: string;
  duration: number;
  id: string;
  number: number;
  result: string;
  timestamp: number;
  url: string;
  fullDisplayName: string;
  description: string;
}

export interface JenkinsState {
  newJobsLastCompletedBuilds: Record<string, number>; // job to build number
}

export class Jenkins {
  constructor(
    private readonly client: any, // It should be 'JenkinsPromisifiedAPI' instead of any, but we could not make it work
    private readonly logger: AirbyteLogger
  ) {}

  private static parse(str: string, ...args: any[]): string {
    let i = 0;
    return str.replace(/%s/g, () => args[i++]);
  }

  private static validateConfig(config: JenkinsConfig): void {
    if (typeof config.server_url !== 'string') {
      throw new VError('server_url: must be a string');
    }

    if (config.user || config.token) {
      if (!config.user || !config.token) {
        throw new VError(
          'user and token must be either both specified or both empty'
        );
      }

      if (typeof config.user !== 'string') {
        throw new VError('user: must be a string');
      }
      if (typeof config.token !== 'string') {
        throw new VError('token: must be a string');
      }
    }

    const depthCheck = Jenkins.validateInteger(config.depth);
    if (!depthCheck[0]) {
      throw new VError(depthCheck[1]);
    }
    const pageSizeCheck = Jenkins.validateInteger(config.pageSize);
    if (!pageSizeCheck[0]) {
      throw new VError(pageSizeCheck[1]);
    }
  }

  private static validateInteger(
    value: number
  ): [true | undefined, string | undefined] {
    if (value) {
      if (typeof value === 'number' && value > 0) {
        return [true, undefined];
      }
      return [undefined, `${value} must be a valid positive number`];
    }
    return [true, undefined];
  }

  static instance(config: JenkinsConfig, logger: AirbyteLogger): Jenkins {
    Jenkins.validateConfig(config);

    let jenkinsUrl: URL;
    try {
      jenkinsUrl = new URL(config.server_url);
    } catch (error) {
      throw new VError('server_url: must be a valid url');
    }

    if (config.user && config.token) {
      jenkinsUrl.username = config.user;
      jenkinsUrl.password = config.token;
    }

    // It should be 'JenkinsPromisifiedAPI' instead of any, but we could not make it work
    const client = new (jenkinsClient as any)({
      baseUrl: jenkinsUrl.toString(),
      crumbIssuer: true,
      promisify: true,
    });

    return new Jenkins(client, logger);
  }

  async checkConnection(): Promise<void> {
    try {
      await this.client.info();
    } catch (error: any) {
      const err = error?.message ?? JSON.stringify(error);
      throw new VError(
        `Please verify your server_url and user/token are correct. Error: ${err}`
      );
    }
  }

  async *syncBuilds(
    jenkinsCfg: JenkinsConfig,
    existingState: JenkinsState | null
  ): AsyncGenerator<Build> {
    const jobs = await this.syncJobs(jenkinsCfg, null);
    for (const job of jobs) {
      const builds = this.constructBuilds(job, existingState);
      for (const build of builds) {
        yield build;
      }
    }
  }

  @Memoize((jenkinsCfg: JenkinsConfig, streamSlice: Job | null) => {
    return `${JSON.stringify(jenkinsCfg)}${JSON.stringify(streamSlice || {})}`;
  })
  async syncJobs(
    jenkinsCfg: JenkinsConfig,
    streamSlice: Job | null
  ): Promise<ReadonlyArray<Job>> {
    const pageSize = jenkinsCfg.pageSize || DEFAULT_PAGE_SIZE;
    const last100Builds = jenkinsCfg.last100Builds ?? false;
    const depth = jenkinsCfg.depth ?? (await this.calculateMaxJobsDepth());
    this.logger.debug(Jenkins.parse('Max depth: %s', depth));

    const numRootJobs = await this.countRootJobs();
    const numPages = Math.ceil(numRootJobs / pageSize);
    this.logger.debug(
      Jenkins.parse(
        'Number of root jobs: %s. Number of pages: %s',
        numRootJobs,
        numPages
      )
    );
    const result = [];
    for (let i = 0, from, to; i < numRootJobs; i += pageSize) {
      from = i;
      to = Math.min(numRootJobs, i + pageSize);
      const jobs = await this.fetchJobs(depth, last100Builds, from, to);
      for (const job of jobs) {
        if (streamSlice && streamSlice.url === job.url) {
          return undefined;
        }
        result.push(job);
      }
    }
    return result;
  }

  /*
  http://localhost:8080/job/job_105_folder/job/job_custom_105/
  job fullName: job_105_folder/job_custom_105
  level: 1 (starts with 0)
  */
  private async calculateMaxJobsDepth(): Promise<number> {
    const jobs = await this.client.job.list({
      depth: POTENTIAL_MAX_DEPTH,
      tree: this.generateTree(POTENTIAL_MAX_DEPTH, FEED_MAX_DEPTH_CALC_PATTERN),
    });
    const allJobs = this.retrieveAllJobs(jobs);

    let maxLevel = 0;
    for (const job of allJobs) {
      const level = (job.fullName.match(/\//g) || []).length;
      if (level > maxLevel) {
        maxLevel = level;
      }
    }
    return maxLevel;
  }

  private constructBuilds(
    job: Job,
    existingState: JenkinsState | null
  ): Build[] {
    const lastBuildNumber =
      existingState?.newJobsLastCompletedBuilds?.[job.fullName];
    const builds = job.allBuilds ?? job.builds ?? [];
    if (!builds.length) {
      this.logger.info(Jenkins.parse("Job '%s' has no builds", job.fullName));
      return builds;
    }
    return lastBuildNumber
      ? builds.filter(
          (build: Build) => build.number > lastBuildNumber && !build.building
        )
      : builds;
  }

  private async countRootJobs(): Promise<number> {
    const jobs = await this.client.job.list({tree: FEED_JOBS_COUNT_PATTERN});
    return jobs.length;
  }

  private async fetchJobs(
    depth: number,
    last100Builds: boolean,
    from: number,
    to: number
  ): Promise<Job[]> {
    const page = `{${from},${to}}`; // `to` parameter is exclusive
    const builds = last100Builds ? 'builds' : 'allBuilds';
    try {
      const rootJobs = await this.client.job.list({
        // https://www.jenkins.io/doc/book/using/remote-access-api/#RemoteaccessAPI-Depthcontrol
        depth: depth,
        tree:
          this.generateTree(
            depth,
            util.format(FEED_ALL_FIELDS_PATTERN, builds)
          ) + page,
      });

      return this.retrieveAllJobs(rootJobs);
    } catch (err: any) {
      this.logger.warn(
        Jenkins.parse(
          'Failed to fetch jobs in page %s: %s. Skipping page.',
          page,
          err.message
        )
      );
      return [];
    }
  }

  /** Jenkins JSON API does not support deep scan, it is required to
   * generate a suitable tree for the corresponding depth. Job in some cases have
   * many sub jobs, depth needs to quantify how many sub jobs are showed
   */
  private generateTree(depth: number, fieldsPattern: string): string {
    let tree = 'jobs[' + fieldsPattern + ']';
    for (let i = 0; i < depth; i++) {
      tree = tree.replace('*', fieldsPattern);
    }

    return tree;
  }

  // we need to flatten all jobs to a list from the tree structure
  private retrieveAllJobs(rootJobs: Job[]): Job[] {
    const allJobs: Job[] = [];
    while (rootJobs?.length) {
      const job = rootJobs.pop();
      // only jobs with builds are required, skip folders
      if (!job) {
        break;
      }
      if (job.nextBuildNumber) {
        allJobs.push(job);
      } else if (job.jobs) {
        for (const nestedJob of job.jobs) {
          nestedJob.name = `${job.name}/${nestedJob.name}`;
        }
        rootJobs.push(...job.jobs);
      }
    }
    return allJobs;
  }
}
