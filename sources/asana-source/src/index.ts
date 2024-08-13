import {Command} from 'commander';
import {
  AirbyteConfiguredCatalog,
  AirbyteSourceBase,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteState,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import {AirbyteSourceLogger} from 'faros-airbyte-cdk';
import {get, isNil} from 'lodash';
import VError from 'verror';

import {
  Asana,
  AsanaConfig,
  DEFAULT_PROJECT_TASKS_MAX_STALENESS_HOURS,
} from './asana';
import {
  Projects,
  ProjectTasks,
  Tags,
  Tasks,
  Users,
  Workspaces,
} from './streams';

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteSourceLogger();
  const source = new AsanaSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

/** Asana source implementation. */
export class AsanaSource extends AirbyteSourceBase<AsanaConfig> {
  get type(): string {
    return 'asana';
  }

  async spec(): Promise<AirbyteSpec> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return new AirbyteSpec(require('../resources/spec.json'));
  }
  async checkConnection(config: AsanaConfig): Promise<[boolean, VError]> {
    try {
      const asana = Asana.instance(config, this.logger);
      await asana.checkConnection();
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }
  streams(config: AsanaConfig): AirbyteStreamBase[] {
    return [
      new Projects(config, this.logger),
      new Tags(config, this.logger),
      new Tasks(config, this.logger),
      new Users(config, this.logger),
      new Workspaces(config, this.logger),
      new ProjectTasks(config, this.logger),
    ];
  }

  async onBeforeRead(
    config: AsanaConfig,
    catalog: AirbyteConfiguredCatalog,
    state?: AirbyteState
  ): Promise<{
    config: AsanaConfig;
    catalog: AirbyteConfiguredCatalog;
    state?: AirbyteState;
  }> {
    const streams = catalog.streams.filter((stream) => {
      if (stream.stream.name !== 'project_tasks') {
        return true;
      }
      const lastComputedAt = get(state, ['project_tasks', 'lastComputedAt']);
      const maxStalenessMillis =
        (config.project_tasks_max_staleness_hours ??
          DEFAULT_PROJECT_TASKS_MAX_STALENESS_HOURS) *
        60 *
        60 *
        1000;
      return (
        isNil(lastComputedAt) ||
        maxStalenessMillis === 0 ||
        Date.now() - lastComputedAt >= maxStalenessMillis
      );
    });
    return {config, catalog: {streams}, state};
  }
}
