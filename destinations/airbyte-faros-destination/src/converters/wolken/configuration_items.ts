import {AirbyteRecord} from 'faros-airbyte-cdk';
import {ConfigurationItem, User} from 'faros-airbyte-common/wolken';
import _ from 'lodash';

import {ComputeApplication} from '../common/common';
import {
  DestinationModel,
  DestinationRecord,
  StreamContext,
  StreamName,
} from '../converter';
import {WolkenConverter} from './common';

export class ConfigurationItems extends WolkenConverter {
  static readonly usersStream = new StreamName('wolken', 'users');

  override get dependencies(): ReadonlyArray<StreamName> {
    return [ConfigurationItems.usersStream];
  }

  id(record: AirbyteRecord) {
    return record?.record?.data?.ciId;
  }

  toContextStorageRecord(record: AirbyteRecord, ctx: StreamContext) {
    const configurationItem = record.record.data as ConfigurationItem;
    const serviceIdFlexFieldName = this.config(ctx).service_id_flex_field_name;
    const serviceIdFlexField = WolkenConverter.getFlexField(
      configurationItem,
      serviceIdFlexFieldName
    );
    const configItemCompact = serviceIdFlexField
      ? {flexFields: [serviceIdFlexField]}
      : {};
    return AirbyteRecord.make(this.streamName.asString, configItemCompact);
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
    const res: DestinationRecord[] = [];
    const configurationItem = record.record.data as ConfigurationItem;

    const application = this.getApplication(configurationItem, ctx);

    if (!application) {
      return [];
    }

    const jiraProjectKeyFlexFieldName =
      this.config(ctx).jira_project_key_flex_field_name;
    const jiraProjectKey = WolkenConverter.getFlexField(
      configurationItem,
      jiraProjectKeyFlexFieldName
    )?.flexValue;

    const project = {
      uid: jiraProjectKey ?? 'unknown',
      source: 'Jira',
    };

    const appKey = JSON.stringify(application);
    if (!this.seenServices.has(appKey)) {
      res.push({model: 'compute_Application', record: application});
      this.seenServices.add(appKey);

      const applicationTagFlexFieldNames =
        this.config(ctx).application_tag_flex_field_names ?? [];
      for (const flexFieldName of applicationTagFlexFieldNames) {
        const flexField = WolkenConverter.getFlexField(
          configurationItem,
          flexFieldName
        );
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

      const applicationTagFlexFieldUserLookupNames =
        this.config(ctx).application_tag_flex_field_user_lookup_names ?? [];
      const userLookupExtraFieldsMapping =
        this.userLookupExtraFieldsMapping(ctx);
      for (const flexFieldUserLookupName of applicationTagFlexFieldUserLookupNames) {
        const flexField = WolkenConverter.getFlexField(
          configurationItem,
          flexFieldUserLookupName
        );
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
          const user = this.getUserFromLookup(flexField.flexValue, ctx);
          if (user) {
            for (const [displayName, path] of Object.entries(
              userLookupExtraFieldsMapping
            )) {
              const value = _.get(user, path);
              res.push(
                ...this.applicationTagFromUserLookupField(
                  flexField.flexName,
                  value,
                  displayName,
                  application
                )
              );
            }
          }
        }
      }

      const projectTagFlexFieldNames =
        this.config(ctx).project_tag_flex_field_names ?? [];
      for (const flexFieldName of projectTagFlexFieldNames) {
        const flexField = WolkenConverter.getFlexField(
          configurationItem,
          flexFieldName
        );
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
      const pathHierarchyFlexFieldNames =
        this.config(ctx).path_hierarchy_flex_field_names ?? [];
      for (const flexFieldName of pathHierarchyFlexFieldNames) {
        const flexField = WolkenConverter.getFlexField(
          configurationItem,
          flexFieldName
        );
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

  private getUserFromLookup(
    userPsNo: string,
    ctx: StreamContext
  ): User | undefined {
    const user = ctx.get(ConfigurationItems.usersStream.asString, userPsNo);
    if (!user) {
      return undefined;
    }
    return user.record.data as User;
  }

  private applicationTagFromUserLookupField(
    userLookupFlexFieldName: string,
    userFieldValue: string,
    userFieldDisplayName: string,
    application: ComputeApplication
  ) {
    if (!userFieldValue) {
      return [];
    }
    const tag = {
      uid: `${userLookupFlexFieldName} ${userFieldDisplayName}__${userFieldValue}`,
      key: `${userLookupFlexFieldName} ${userFieldDisplayName}`,
      value: userFieldValue,
    };
    return [
      {
        model: 'faros_Tag',
        record: tag,
      },
      {
        model: 'compute_ApplicationTag',
        record: {application, tag: {uid: tag.uid}},
      },
    ];
  }
}
