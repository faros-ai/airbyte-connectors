import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {FarosOrgImportConverter} from './common';
import {ToolMap, ToolRow} from './types';

export class Tools extends FarosOrgImportConverter {
  id(record: AirbyteRecord): any {
    const tool = record?.record?.data;
    return `${tool.tool}__${tool?.employeeId}`;
  }

  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'org_EmployeeTool',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    ctx.logger?.debug(JSON.stringify(record));
    const models = [];

    const tool = record.record.data as ToolRow;

    const formattedTool = this.formatTool(tool.tool);
    if (tool.employeeId && formattedTool) {
      models.push({
        model: 'org_EmployeeTool',
        record: {
          employee: {uid: tool.employeeId},
          tool: formattedTool,
          activatedAt: Utils.toDate(tool.activatedAt),
          deactivatedAt: Utils.toDate(tool.deactivatedAt),
        },
      });
    }

    return models;
  }

  private formatTool(
    tool?: string
  ): {category: string; detail: string} | undefined {
    if (!tool) return undefined;

    const normalizedTool = tool.replace(/\s/g, '').toLowerCase();
    if (normalizedTool in ToolMap) {
      return {
        category: ToolMap[normalizedTool],
        detail: tool,
      };
    } else {
      return {category: 'Custom', detail: tool};
    }
  }
}
