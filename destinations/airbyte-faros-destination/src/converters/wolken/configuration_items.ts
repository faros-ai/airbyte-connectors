import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {WolkenConverter} from './common';
import {ConfigurationItem} from 'faros-airbyte-common/wolken';

export class ConfigurationItems extends WolkenConverter {
  id(record: AirbyteRecord) {
    return record?.record?.data?.ciId;
  }

  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'compute_Application',
    'compute_ApplicationTag',
    'compute_ApplicationPath',
    'faros_Path',
    'faros_Tag',
    'tms_ProjectTag',
    'tms_ProjectPath',
  ];

  private readonly seenServices = new Set<string>();

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const configurationItem = record.record.data as ConfigurationItem;

    const getFlexField = (flexId: number) =>
      configurationItem.flexFields?.find(f => f.flexId === flexId);

    const serviceIdFlexId = this.config(ctx).service_id_flex_id;
    const serviceId = getFlexField(serviceIdFlexId)?.flexValue;

    if (!serviceId) {
      return [];
    }

    const res: DestinationRecord[] = [];

    const applicationMapping = this.applicationMapping(ctx);
    let application = {
      name: serviceId,
      platform: 'unknown',
    };

    const jiraProjectKeyFlexId = this.config(ctx).jira_project_key_flex_id;
    const jiraProjectKey = getFlexField(jiraProjectKeyFlexId)?.flexValue;

    const project = {
      uid: jiraProjectKey ?? 'unknown',
      source: 'Jira',
    };

    if (serviceId in applicationMapping && applicationMapping[serviceId].name) {
      const mappedApp = applicationMapping[serviceId];
      application = {
        ...application,
        name: mappedApp.name,
        platform: mappedApp.platform ?? application.platform,
      };
    }

    const appKey = JSON.stringify(application);
    if (!this.seenServices.has(appKey)) {
      res.push({model: 'compute_Application', record: application});
      this.seenServices.add(appKey);

      const applicationTagFlexIds = this.config(ctx).application_tag_flex_ids ?? [];
      for (const flexId of applicationTagFlexIds) {
        const flexField = getFlexField(flexId);
        if (flexField) {
          const tag = {
            uid: `${flexField.flexName}__${flexField.flexValue}`,
            key: flexField.flexName,
            value: flexField.flexValue,
          };
          res.push({model: 'faros_Tag', record: tag});
          res.push({
            model: 'compute_ApplicationTag',
            record: {application, tag: {uid: tag.uid}},
          });
        }
      }

      const projectTagFlexIds = this.config(ctx).project_tag_flex_ids ?? [];
      for (const flexId of projectTagFlexIds) {
        const flexField = getFlexField(flexId);
        if (flexField) {
          const tag = {
            uid: `${flexField.flexName}__${flexField.flexValue}`,
            key: flexField.flexName,
            value: flexField.flexValue,
          };
          res.push({model: 'faros_Tag', record: tag});
          res.push({
            model: 'tms_ProjectTag',
            record: {project, tag: {uid: tag.uid}},
          });
        }
      }

      // Custom Application and Jira Path Hierarchy
      const pathParts = [];
      const pathHierarchyFlexIds = this.config(ctx).path_hierarchy_flex_ids ?? [];
      for (const flexId of pathHierarchyFlexIds) {
        const flexField = getFlexField(flexId);
        pathParts.push(flexField?.flexValue?.replace(/\//, '_') ?? 'unknown');
      }

      if (pathParts.length > 0) {
        const path = pathParts.join('/');
        const faros_Path = {
          uid: path,
          path,
        };
        res.push({model: 'faros_Path', record: faros_Path});
        res.push({
          model: 'compute_ApplicationPath',
          record: {
            application: application,
            path: {uid: faros_Path.uid},
          },
        });
        res.push({
          model: 'tms_ProjectPath',
          record: {project, path: {uid: faros_Path.uid}},
        });
      }
    }

    return res;
  }
}
