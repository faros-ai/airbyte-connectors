import {
  AirbyteConfig,
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import jenkinsClient, {JenkinsPromisifiedAPI} from 'jenkins';
import {Dictionary} from 'ts-essentials';
import {URL} from 'url';
import util from 'util';

const DEFAULT_PAGE_SIZE = 10;
const FEED_ALL_FIELDS_PATTERN = `name,fullName,url,lastCompletedBuild[number],%s[id,displayName,number,building,result,timestamp,duration,url,actions[lastBuiltRevision[SHA1],remoteUrls],fullName,fullDisplayName],jobs[*]`;
const FEED_JOBS_COUNT_PATTERN = 'jobs[name]';
const FEED_MAX_DEPTH_CALC_PATTERN = 'fullName,jobs[*]';
const FOLDER_JOB_TYPE = 'com.cloudbees.hudson.plugins.folder.Folder';
const POTENTIAL_MAX_DEPTH = 10;

export interface JenkinsConfig extends AirbyteConfig {
  readonly server_url: string;
  readonly user: string;
  readonly token: string;
  readonly depth?: number;
  readonly pageSize?: number;
  readonly last100Builds?: boolean;
}

interface Job {
  _class: string;
  fullName: string;
  name: string;
  url: string;
  allBuilds?: Build[];
  builds?: Build[];
  lastCompletedBuild: Build | null;
  jobs?: Job[];
}

interface Build {
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
}

interface JenkinsState {
  newJobsLastCompletedBuilds: Record<string, number>; // job to build number
}

function parse(str: string, ...args: any[]): string {
  let i = 0;
  return str.replace(/%s/g, () => args[i++]);
}

function buildNameToJob(str: string): string {
  return str.substring(0, str.indexOf(' '));
}

export class Jenkins {
  constructor(
    private readonly client: any,
    private readonly logger: AirbyteLogger
  ) {}

  static async validateClient(
    config: JenkinsConfig
  ): Promise<[JenkinsPromisifiedAPI | undefined, string | undefined]> {
    if (typeof config.server_url !== 'string') {
      return [undefined, 'server_url: must be a string'];
    }
    if (typeof config.user !== 'string') {
      return [undefined, 'User: must be a string'];
    }
    if (typeof config.token !== 'string') {
      return [undefined, 'Token: must be a string'];
    }

    let jenkinsUrl;
    try {
      jenkinsUrl = new URL(config.server_url);
    } catch (error) {
      return [undefined, 'server_url: must be a valid url'];
    }

    jenkinsUrl.username = config.user;
    jenkinsUrl.password = config.token;

    const client = jenkinsClient({
      baseUrl: jenkinsUrl.toString(),
      crumbIssuer: true,
      promisify: true,
    });

    try {
      await client.info();
    } catch (error) {
      return [
        undefined,
        'server_url: Please verify your user/token is correct',
      ];
    }
    return [client, undefined];
  }

  async *syncBuilds(
    jenkinsCfg: JenkinsConfig,
    existingState: JenkinsState | null
  ): AsyncGenerator<Build> {
    const iter = this.syncJobs(jenkinsCfg, null);
    for await (const job of iter) {
      const builds = this.constructBuilds(job, existingState);
      for (const build of builds) {
        yield build;
      }
    }
  }

  async *syncJobs(
    jenkinsCfg: JenkinsConfig,
    streamSlice: Job | null
  ): AsyncGenerator<Job> {
    const pageSize = jenkinsCfg.pageSize || DEFAULT_PAGE_SIZE;
    const last100Builds = jenkinsCfg.last100Builds ?? false;
    const depth = jenkinsCfg.depth ?? (await this.calculateMaxJobsDepth());
    this.logger.debug(parse('Max depth: %s', depth));

    const numRootJobs = await this.countRootJobs();
    const numPages = Math.ceil(numRootJobs / pageSize);
    this.logger.debug(
      parse(
        'Number of root jobs: %s. Number of pages: %s',
        numRootJobs,
        numPages
      )
    );
    for (let i = 0, from, to; i < numRootJobs; i += pageSize) {
      from = i;
      to = Math.min(numRootJobs, i + pageSize);
      const jobs = await this.fetchJobs(depth, last100Builds, from, to);
      for (const job of jobs) {
        if (streamSlice && streamSlice.url === job.url) {
          return undefined;
        }
        yield job;
      }
    }
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
      this.logger.info(parse("Job '%s' has no builds", job.fullName));
      return builds;
    }
    return lastBuildNumber
      ? builds.filter(
          (build: any) => build.number > lastBuildNumber && !build.building
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
    } catch (err) {
      this.logger.warn(
        parse(
          'Failed to fetch jobs in page %s: %s. Skipping page.',
          page,
          err.message
        )
      );
      return [];
    }
  }

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
      if (job._class === FOLDER_JOB_TYPE) {
        if (job.jobs) {
          for (const nestedJob of job.jobs) {
            nestedJob.name = `${job.name}/${nestedJob.name}`;
          }
          rootJobs.push(...job.jobs);
        }
      } else {
        allJobs.push(job);
      }
    }
    return allJobs;
  }
}

export class JenkinsBuilds extends AirbyteStreamBase {
  constructor(readonly config: JenkinsConfig, logger: AirbyteLogger) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../resources/schemas/builds.json');
  }
  get primaryKey(): StreamKey {
    return 'fullDisplayName';
  }
  get cursorField(): string | string[] {
    return 'number';
  }
  async *streamSlices(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Build
  ): AsyncGenerator<Build | undefined> {
    yield undefined;
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Build,
    streamState?: JenkinsState
  ): AsyncGenerator<Build, any, any> {
    const [client, errorMessage] = await Jenkins.validateClient(this.config);
    if (!client) {
      this.logger.error(errorMessage || '');
      return undefined;
    }
    const jenkins = new Jenkins(client, this.logger);

    let iter: AsyncGenerator<Build, any, unknown>;
    if (syncMode === SyncMode.FULL_REFRESH) {
      iter = jenkins.syncBuilds(this.config, null);
    } else {
      iter = jenkins.syncBuilds(this.config, streamState ?? null);
    }
    yield* iter;
  }

  getUpdatedState(
    currentStreamState: JenkinsState,
    latestRecord: Build
  ): JenkinsState {
    const jobName = buildNameToJob(latestRecord.fullDisplayName);
    if (!currentStreamState.newJobsLastCompletedBuilds) {
      currentStreamState.newJobsLastCompletedBuilds = {};
    }
    currentStreamState.newJobsLastCompletedBuilds[jobName] = Math.max(
      currentStreamState?.newJobsLastCompletedBuilds[jobName] ?? 0,
      latestRecord?.number ?? 0
    );
    return currentStreamState;
  }
}

export class JenkinsJobs extends AirbyteStreamBase {
  constructor(readonly config: JenkinsConfig, logger: AirbyteLogger) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../resources/schemas/jobs.json');
  }
  get primaryKey(): StreamKey {
    return 'fullName';
  }
  get cursorField(): string | string[] {
    return [];
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Job,
    streamState?: any
  ): AsyncGenerator<Job, any, any> {
    const [client, errorMessage] = await Jenkins.validateClient(this.config);
    if (!client) {
      this.logger.error(errorMessage || '');
      return undefined;
    }

    const jenkins = new Jenkins(client, this.logger);

    if (syncMode === SyncMode.FULL_REFRESH) {
      yield* jenkins.syncJobs(this.config, null);
    }
  }
}
