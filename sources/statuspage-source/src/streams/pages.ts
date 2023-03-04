import {StreamKey} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Page} from '../types';
import {StatuspageStreamBase} from './common';

export class Pages extends StatuspageStreamBase {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/pages.json');
  }

  get primaryKey(): StreamKey {
    return 'id';
  }

  async *readRecords(): AsyncGenerator<Page> {
    yield* this.statuspage.getPages(this.cfg.page_ids);
  }
}
