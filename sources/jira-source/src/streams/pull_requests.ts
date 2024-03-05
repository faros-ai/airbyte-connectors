import {AirbyteLogger, AirbyteStreamBase, StreamKey, SyncMode} from "faros-airbyte-cdk";
import {Dictionary} from "ts-essentials";
import {Jira, JiraConfig} from "../jira";

export class PullRequests extends AirbyteStreamBase {
  constructor(
    private readonly config: JiraConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/taskPullrequests.json');
  }

  get primaryKey(): StreamKey | undefined {
    return 'number';
  }

  // TODO: Support Incremental Sync
  async *readRecords(syncMode: SyncMode, cursorField?: string[], streamSlice?: Dictionary<any>, streamState?: Dictionary<any>): AsyncGenerator<Dictionary<any>> {
    const jira = await Jira.instance(this.config, this.logger);
    for (const projectKey of this.config.projectKeys) {
      for await (const issue of jira.getIssues(projectKey, true)) {
        if (issue.pullRequests) {
          for (const pullRequest of issue.pullRequests) {
            yield {issueKey: issue.key, ...pullRequest};
          }
        }
      }
    }
  }

}