import {AirbyteRecord} from 'faros-airbyte-cdk';
import {isString} from 'lodash';

import {Converter, StreamContext} from '../converter';

type TaskBoardSource = 'space' | 'folder' | 'list';

interface ClickUpConfig {
  taskboard_sources?: ReadonlyArray<TaskBoardSource>;
  truncate_limit?: number;
}

const DEFAULT_TASKBOARD_SOURCES: ReadonlyArray<TaskBoardSource> = ['space'];
const DEFAULT_TRUNCATE_LIMIT = 10_000;

export class ClickUpCommon {
  static normalize(str: string): string {
    return str.replace(/\s/g, '').toLowerCase();
  }

  static statusCategory(status: string): string {
    switch (this.normalize(status)) {
      case 'open':
        return 'Todo';
      case 'todo':
        return 'Todo';
      case 'inprogress':
        return 'InProgress';
      case 'closed':
        return 'Done';
      default:
        return 'Custom';
    }
  }
}

export abstract class ClickUpConverter extends Converter {
  source = 'ClickUp';

  /** All ClickUp records should have id property */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }

  protected clickupConfig(ctx: StreamContext): ClickUpConfig {
    return ctx.config.source_specific_configs?.clickup ?? {};
  }

  protected taskboardSources(
    ctx: StreamContext
  ): ReadonlyArray<TaskBoardSource> {
    return (
      this.clickupConfig(ctx).taskboard_sources ?? DEFAULT_TASKBOARD_SOURCES
    );
  }

  protected truncateLimit(ctx: StreamContext): number {
    return this.clickupConfig(ctx).truncate_limit ?? DEFAULT_TRUNCATE_LIMIT;
  }

  protected truncate(ctx: StreamContext, str?: string): string | undefined {
    if (isString(str) && str.length > this.truncateLimit(ctx)) {
      return str.substring(0, this.truncateLimit(ctx));
    }
    return str;
  }
}
