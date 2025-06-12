import {AirbyteRecord} from 'faros-airbyte-cdk';
import {DailyUsageItem} from 'faros-airbyte-common/cursor';

import {Converter, StreamContext} from '../converter';

export interface CursorConfig {
  custom_metrics?: ReadonlyArray<keyof DailyUsageItem>;
}

export abstract class CursorConverter extends Converter {
  source = 'Cursor';

  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }

  protected cursorConfig(ctx: StreamContext): CursorConfig {
    return ctx?.config?.source_specific_configs?.cursor ?? {};
  }
}
