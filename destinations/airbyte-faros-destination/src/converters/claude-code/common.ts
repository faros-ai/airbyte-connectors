import {AirbyteRecord} from 'faros-airbyte-cdk';

import {Converter} from '../converter';

export enum ClaudeCodeFeature {
  EditTool = 'EditTool',
  MultiEditTool = 'MultiEditTool',
  NotebookEditTool = 'NotebookEditTool',
  WriteTool = 'WriteTool',
  UsageGeneral = 'UsageGeneral',
}

export abstract class ClaudeCodeConverter extends Converter {
  source = 'ClaudeCode';

  id(record: AirbyteRecord): any {
    return record?.record?.data?.email || record?.record?.data?.id;
  }
}
