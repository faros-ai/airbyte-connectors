import {AirbyteLogger, AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {LocationCollector} from '../common/geo';
import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {FarosOrgImportConverter, lift} from './common';
import {EmployeeRow, EmployeeTypeMap, IdentityNamespace, Source} from './types';

export class Employees extends FarosOrgImportConverter {
  private locationCollector: LocationCollector = undefined;
  private collectedTmsUsers = new Map<[string, string], Set<string>>();
  private collectedVcsUsers = new Map<[string, string], Set<string>>();
  private collectedImsUsers = new Map<[string, string], Set<string>>();
  private collectedCalUsers = new Map<[string, string], Set<string>>();
  private collectedAmsUsers = new Map<[string, string], Set<string>>();
  private collectedSurveyUsers = new Map<[string, string], Set<string>>();
  private seenEmployees = new Set<string>();

  id(record: AirbyteRecord): any {
    return record?.record?.data?.employeeId;
  }

  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'identity_Identity',
    'ams_UserIdentity',
    'cal_UserIdentity',
    'ims_UserIdentity',
    'survey_UserIdentity',
    'tms_UserIdentity',
    'vcs_UserIdentity',
    'org_Employee',
    'org_TeamMembership',
    'geo_Location',
    'geo_Address',
    'geo_Coordinates',
  ];

  private initialize(ctx: StreamContext): void {
    if (this.locationCollector) {
      return;
    }
    this.locationCollector = new LocationCollector(
      ctx?.config?.source_specific_configs?.faros_org_import?.resolve_locations,
      ctx.farosClient
    );
  }

  async convert(
    record: AirbyteRecord,
    ctx?: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    this.initialize(ctx);
    const models = [];

    const row = record.record.data as EmployeeRow;
    const source: Source =
      ctx?.config?.source_specific_configs?.faros_org_import?.source ?? {};

    const empId = row.employeeId;
    if (!empId) {
      ctx.logger?.warn('Missing employeeId in record: ' + JSON.stringify(row));
      return models;
    }

    const amsIds = row.amsId;
    if (amsIds && source?.ams) {
      this.addEmpToMap(empId, amsIds, source?.ams, this.collectedAmsUsers);
    }

    const calIds = row.calId;
    if (calIds && source?.cal) {
      this.addEmpToMap(empId, calIds, source?.cal, this.collectedCalUsers);
    }

    const imsIds = row.imsId;
    if (imsIds && source?.ims) {
      this.addEmpToMap(empId, imsIds, source?.ims, this.collectedImsUsers);
    }

    const surveyIds = row.surveyId;
    if (surveyIds && source?.survey) {
      this.addEmpToMap(
        empId,
        surveyIds,
        source?.survey,
        this.collectedSurveyUsers
      );
    }

    // Aggregate all TMS identity columns in a single map
    const tmsIds = row.tmsId;
    if (tmsIds && source?.tms) {
      this.addEmpToMap(empId, tmsIds, source?.tms, this.collectedTmsUsers);
    }

    const jiraIds = row.tmsId_Jira;
    if (jiraIds) {
      this.addEmpToMap(empId, jiraIds, 'Jira', this.collectedTmsUsers);
    }

    // Aggregate all VCS identity columns in a single map
    const vcsIds = row.vcsId;
    if (vcsIds && source?.vcs) {
      this.addEmpToMap(empId, vcsIds, source?.vcs, this.collectedVcsUsers);
    }

    const githubIds = row.vcsId_GitHub;
    if (githubIds) {
      this.addEmpToMap(empId, githubIds, 'GitHub', this.collectedVcsUsers);
    }

    const bitbucketIds = row.vcsId_BitBucket;
    if (bitbucketIds) {
      this.addEmpToMap(
        empId,
        bitbucketIds,
        'Bitbucket',
        this.collectedVcsUsers
      );
    }

    const teamIds = row.teamId;
    if (teamIds) {
      for (const untrimmed of teamIds.split(',')) {
        const teamId = untrimmed.trim();
        models.push({
          model: 'org_TeamMembership',
          record: {
            team: {uid: teamId},
            member: {uid: empId},
          },
        });
      }
    }

    // Create identity and employee only if empId has not been seen before
    if (!this.seenEmployees.has(empId)) {
      models.push({
        model: 'identity_Identity',
        record: {
          uid: empId,
          fullName: row.fullName,
          primaryEmail: row.email,
          emails: row.email ? [row.email] : [],
        },
      });
      models.push({
        model: 'org_Employee',
        record: {
          uid: empId,
          identity: {uid: empId},
          level: lift(row.level, Utils.parseInteger),
          employmentType: this.formatEmployeeType(row.type),
          location: await this.locationCollector.collect(row.location),
          joinedAt: Utils.toDate(row.joinedAt),
          terminatedAt: Utils.toDate(row.terminatedAt),
          inactive: this.toBoolean(row.inactive),
          ignored: this.toBoolean(row.ignored),
          title: row.title,
          role: row.role,
        },
      });
      this.seenEmployees.add(empId);
    } else {
      ctx.logger?.warn('Duplicate employeeId: ' + empId);
    }

    return models;
  }

  private addEmpToMap(
    employeeId: string,
    ids: string,
    source: string,
    map: Map<[string, string], Set<string>>
  ): void {
    for (const untrimmedId of ids.split(',')) {
      const id = untrimmedId.trim();
      if (id === '') continue;
      const key: [string, string] = [id, source];
      let employeeIds: Set<string>;
      if (map.has(key)) {
        employeeIds = map.get(key)!;
      } else {
        employeeIds = new Set();
        map.set(key, employeeIds);
      }
      employeeIds.add(employeeId);
    }
  }

  private getIdentityModels(
    userMap: Map<[string, string], Set<string>>,
    namespace: IdentityNamespace,
    logger?: AirbyteLogger
  ): DestinationRecord[] {
    logger?.info(`Syncing ${namespace} user identities...`);
    const models: DestinationRecord[] = [];
    for (const [[uid, source], employeeIdsSet] of userMap) {
      if (employeeIdsSet.size === 0) continue;
      const employeeIds = Array.from(employeeIdsSet.values());
      if (employeeIds.length > 1) {
        logger?.warn(
          `Duplicate employeeIds found for ${namespace} user [${uid}]: ${employeeIds.join(', ')}`
        );
      }
      // Always write the association even if duplicate employeeIds detected
      models.push({
        model: `${namespace}_UserIdentity`,
        record: {
          [`${namespace}User`]: {uid, source},
          identity: {uid: employeeIds[0]},
        },
      });
    }
    return models;
  }

  private formatEmployeeType(
    type?: string
  ): {category: string; detail: string} | undefined {
    if (!type) return undefined;

    const employeeType = type.toLowerCase();
    if (employeeType in EmployeeTypeMap) {
      return {category: EmployeeTypeMap[employeeType], detail: type};
    }

    return {category: 'Custom', detail: type};
  }

  private toBoolean(v: string | boolean | undefined): boolean {
    if (!v) return false;
    if (typeof v === 'boolean') return v;
    const vv = v.toLowerCase();
    return vv === 'true' || vv === '1';
  }

  async onProcessingComplete(
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const models: DestinationRecord[] = [];
    models.push(
      ...this.getIdentityModels(this.collectedAmsUsers, 'ams', ctx.logger)
    );
    models.push(
      ...this.getIdentityModels(this.collectedCalUsers, 'cal', ctx.logger)
    );
    models.push(
      ...this.getIdentityModels(this.collectedImsUsers, 'ims', ctx.logger)
    );
    models.push(
      ...this.getIdentityModels(this.collectedSurveyUsers, 'survey', ctx.logger)
    );
    models.push(
      ...this.getIdentityModels(this.collectedTmsUsers, 'tms', ctx.logger)
    );
    models.push(
      ...this.getIdentityModels(this.collectedVcsUsers, 'vcs', ctx.logger)
    );
    models.push(...this.locationCollector.convertLocations());
    return models;
  }
}
