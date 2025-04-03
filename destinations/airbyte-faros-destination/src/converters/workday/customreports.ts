import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';
import {isNil} from 'lodash';

import {LocationCollector} from '../common/geo';
import {
  Converter,
  DestinationModel,
  DestinationRecord,
  StreamContext,
} from '../converter';
import {
  EmployeeRecord,
  ManagerTimeRecord,
  org_EmploymentType,
  recordKeyTyping,
} from './models';

export class Customreports extends Converter {
  private locationCollector: LocationCollector = undefined;

  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'org_Team',
    'org_Employee',
    'identity_Identity',
    'org_TeamMembership',
    'geo_Location',
    'geo_Address',
    'geo_Coordinates',
  ];
  source = 'workday';
  FAROS_TEAM_ROOT = 'all_teams';
  FAROS_UNASSIGNED_TEAM = 'unassigned';
  recordCount = {
    skippedRecords: 0,
    storedRecords: 0,
  };
  employeeIDToRecords: Record<string, EmployeeRecord[]> = {};
  teamIDToManagerIDs: Record<string, ManagerTimeRecord[]> = {};
  teamIDToTeamName: Record<string, string> = {
    all_teams: this.FAROS_TEAM_ROOT,
    unassigned: this.FAROS_UNASSIGNED_TEAM,
  };
  cycleChains: ReadonlyArray<string>[] = [];
  replacedParentTeams: string[] = [];
  generalLogCollection: string[] = [];
  terminatedEmployees: EmployeeRecord[] = [];
  currentDate: Date = new Date();
  // These variables are populated in setOrgsToKeepAndIgnore
  org_ids_to_keep = null;
  org_ids_to_ignore = null;
  // Logging variables
  skipped_due_to_missing_fields = 0;
  skipped_due_to_termination = 0;
  // employees that appear in more than one record belong to more than one team
  employees_with_more_than_one_record_by_id: Record<string, number> = {};
  writtenEmployeeIds: Set<string> = new Set<string>();
  failedRecordFields: Set<string> = new Set<string>();
  // Store all the input teams for reference in the end
  additionalTeamToParentInputs: Set<string> = new Set<string>();

  /** Every workday record should have this property */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.Employee_Id + record?.record?.data?.Team_ID;
  }

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const rec = record.record.data as EmployeeRecord;
    if (!this.checkRecordValidity(rec, ctx)) {
      this.recordCount.skippedRecords += 1;
    } else {
      this.recordCount.storedRecords += 1;
      this.extractRecordInfo(rec, ctx);
    }
    return [];
  }

  private extractRecordInfo(rec: EmployeeRecord, ctx: StreamContext): void {
    // Extracts information from record to class structures
    // in order to be used once all records are processed
    if (
      ctx.config.source_specific_configs?.workday?.keep_terminated_employees
    ) {
      if (this.isTerminated(rec)) {
        this.terminatedEmployees.push(rec);
        return;
      }
    }
    // We might have more than one record per employee (hopefully not many)
    if (rec.Employee_ID in this.employeeIDToRecords) {
      this.employeeIDToRecords[rec.Employee_ID].push(rec);
      if (rec.Employee_ID in this.employees_with_more_than_one_record_by_id) {
        this.employees_with_more_than_one_record_by_id[rec.Employee_ID] += 1;
      } else {
        this.employees_with_more_than_one_record_by_id[rec.Employee_ID] = 2;
      }
    } else {
      this.employeeIDToRecords[rec.Employee_ID] = [rec];
    }
    this.updateTeamToManagerRecord(rec);
    this.updateTeamIDToTeamNameMapping(rec);
  }

  private updateTeamToManagerRecord(rec: EmployeeRecord): void {
    // We store all the possible Manager IDs for a Team,
    // The last one in the list will be the most recent time.

    // We check if the Team ID happens to be FAROS_TEAM_ROOT.
    // If this is the case, then the rest of the processing won't work.
    if (rec.Team_ID === this.FAROS_TEAM_ROOT) {
      let error_str = `Record team ID is the same as Faros Team Root, ${this.FAROS_TEAM_ROOT}:`;
      error_str += `Record: ${JSON.stringify(rec)}`;
      throw new Error(error_str);
    }

    // Here we check if we haven't yet stored info for this Team ID:
    if (!(rec.Team_ID in this.teamIDToManagerIDs)) {
      this.teamIDToManagerIDs[rec.Team_ID] = [
        {Manager_ID: rec.Manager_ID, Timestamp: rec.Start_Date},
      ];
      return;
    }

    // We have already stored info for this team. This should be a list
    const recs_list = this.teamIDToManagerIDs[rec.Team_ID];

    const crt_last_rec = recs_list[recs_list.length - 1];
    if (crt_last_rec.Manager_ID === rec.Manager_ID) {
      return;
    }

    if (Utils.toDate(rec.Start_Date) > Utils.toDate(crt_last_rec.Timestamp)) {
      this.teamIDToManagerIDs[rec.Team_ID].push({
        Manager_ID: rec.Manager_ID,
        Timestamp: rec.Start_Date,
      });
    }
  }

  private updateTeamIDToTeamNameMapping(rec: EmployeeRecord): void {
    this.teamIDToTeamName[rec.Team_ID] = rec.Team_Name;
  }

  private convertRecordToStandardizedForm(rec: any): any {
    const new_rec = {};
    for (const [k, v] of Object.entries(rec)) {
      const alphanum_key = k.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      if (alphanum_key in recordKeyTyping) {
        new_rec[recordKeyTyping[alphanum_key]] = v;
      }
    }
    return new_rec;
  }

  private isTerminated(rec: EmployeeRecord): boolean {
    const terminationDate = this.getTerminationDate(rec);
    if (!terminationDate || !rec.Start_Date) {
      return false;
    }
    const startDate = Utils.toDate(rec.Start_Date);
    // We ensure start Date is before termination date because there are cases
    // where the termination date is before the start date, for example if
    // an employee leaves the company and rejoins later
    if (terminationDate < this.currentDate && startDate < terminationDate) {
      return true;
    }
    return false;
  }

  private getTerminationDate(rec: EmployeeRecord): Date | undefined {
    if (!isNil(rec.Termination_Date)) {
      return Utils.toDate(rec.Termination_Date);
    }
    if (!isNil(rec.Termination_date)) {
      return Utils.toDate(rec.Termination_date);
    }
    return undefined;
  }

  private checkRecordValidity(
    rec: EmployeeRecord,
    ctx: StreamContext
  ): boolean {
    rec = this.convertRecordToStandardizedForm(rec);
    if (
      !rec.Employee_ID ||
      !rec.Full_Name ||
      !rec.Manager_ID ||
      !rec.Start_Date ||
      !rec.Team_ID ||
      !rec.Team_Name
    ) {
      // We convert the record keys into a sorted comma-separated string
      this.failedRecordFields.add(this.getSortedRecordFields(rec));
      this.skipped_due_to_missing_fields += 1;
      return false;
    }
    // We're only keeping active records
    if (this.isTerminated(rec)) {
      if (
        !ctx.config.source_specific_configs?.workday?.keep_terminated_employees
      ) {
        this.skipped_due_to_termination += 1;
        return false;
      }
    }
    if (ctx.config.source_specific_configs?.workday?.use_parent_team_id) {
      // Despite setting the flag to use parent team ids, record is missing parent team id
      if (!rec.Parent_Team_ID) {
        this.generalLogCollection.push(
          `Missing Parent_Team_ID for record with Employee_ID: ${rec.Employee_ID}`
        );
        this.failedRecordFields.add(this.getSortedRecordFields(rec));
        this.skipped_due_to_missing_fields += 1;
        return false;
      }
    }
    return true;
  }

  private getSortedRecordFields(rec: EmployeeRecord): string {
    const record_keys: string[] = [];
    for (const key in rec) {
      // Check if type is string:
      if (typeof key === 'string') {
        record_keys.push(key);
      } else {
        throw new Error(
          `Key ${key} is not a string, instead type: ${typeof key}`
        );
      }
    }
    const sorted_keys_str = record_keys
      .sort((a, b) => a.localeCompare(b, undefined, {sensitivity: 'base'}))
      .join(',');
    return sorted_keys_str;
  }

  private getManagerIDFromList(
    recs: ManagerTimeRecord[],
    ctx: StreamContext
  ): string | null {
    if (!recs) {
      if (ctx.config.source_specific_configs?.workday?.use_parent_team_id) {
        return null;
      }
      throw new Error('Missing recs');
    }
    const last_record: ManagerTimeRecord = recs[recs.length - 1];
    const manager_id: string = last_record.Manager_ID;
    return manager_id;
  }

  private determineTeamParentId(
    records: EmployeeRecord[],
    teamID: string,
    ctx: StreamContext
  ): string {
    // This function is intended to handle the case where a single person
    // has multiple records in the employee records. This can occur if, for example,
    // a person is on two teams. An accepted case where a person might be on two teams
    // is if they manage a team, and they manage that team's parent team, and so they
    // need to manage a chain of teams. e.g. X manages team A with member X, and
    // team A manages team B with other members.

    // Contract: The records here must form a direct chain, where one person is on
    // the parent team manages a child team which has the same person, and so on.
    // This always returns the parent team of this chain.

    if (records.length < 2) {
      throw new Error(
        `Expected at least 2 records when determining team parent id for team ${teamID}`
      );
    }
    // The employee ID for the employee who appears on several teams.
    // This should be the same throughout, so we can just take the first one.
    const employeeID = records[0].Employee_ID;
    const employeeName = records[0].Full_Name;
    ctx.logger.info(
      `Determining team parent id for employee ${employeeID} (${employeeName})`
    );
    // We keep a list of possible top teams in order to have a hierarchy to build off
    const possibleTopTeamManagerIDs: string[] = [];
    const teamIDToManagerID: Record<string, string> = {};
    for (const record of records) {
      teamIDToManagerID[record.Team_ID] = record.Manager_ID;
      if (record.Manager_ID !== employeeID) {
        // this manager ID belongs to the team which is the parent team:
        possibleTopTeamManagerIDs.push(record.Manager_ID);
      }
    }
    if (possibleTopTeamManagerIDs.length !== 1) {
      throw new Error(
        `Failed to find a top team for employee ${employeeID}. Found ${possibleTopTeamManagerIDs.length} possible top teams.`
      );
    }
    const top_manager_id = possibleTopTeamManagerIDs[0];

    let topTeamID: string | null = null;
    if (top_manager_id in this.employeeIDToRecords) {
      // This is the expected case
      const manager_records: EmployeeRecord[] =
        this.employeeIDToRecords[top_manager_id];
      if (manager_records.length == 1) {
        // Expected case - one record per employee
        topTeamID = manager_records[0].Team_ID;
      } else if (manager_records.length > 1) {
        throw new Error(
          `More than one layer of multiple team manager options in the team hierarchy starting at team ID ${teamID}.`
        );
      }
    }

    if (records.length == 2 && !(teamID in teamIDToManagerID)) {
      ctx.logger.info('Getting non-top team ID from the two records');
      // We know that the parent team is NOT the top team, since this is pointing
      // to a lower team in the hierarchy. We can return the only team which is not the top team.
      for (const record of records) {
        if (record.Team_ID !== topTeamID) {
          return record.Team_ID;
        }
      }
    }
    // We cannot determine the hierarchy of the teams, so we return the top team
    return topTeamID;
  }

  private computeTeamToParentTeamMappingFromManagers(
    ctx: StreamContext,
    teamIDToParentTeamID: Record<string, string>
  ): Record<string, string> {
    ctx.logger.info('Computing team to parent mapping from managers');
    const potential_root_teams: string[] = [];
    for (const [teamID, recs] of Object.entries(this.teamIDToManagerIDs)) {
      if (teamID in teamIDToParentTeamID) {
        // This is the case where the team is already in the input list
        continue;
      }
      const manager_id: string | null = this.getManagerIDFromList(recs, ctx);
      if (!manager_id) {
        this.generalLogCollection.push(
          `Failed to get manager id for team ${teamID}`
        );
        teamIDToParentTeamID[teamID] = this.FAROS_TEAM_ROOT;
        continue;
      }
      let parent_team_uid: string = this.FAROS_TEAM_ROOT;
      if (manager_id in this.employeeIDToRecords) {
        // This is the expected case
        const records: EmployeeRecord[] = this.employeeIDToRecords[manager_id];
        if (records.length == 1) {
          // Expected case - one record per employee
          parent_team_uid = records[0].Team_ID;
        } else if (records.length > 1) {
          // Hacky
          parent_team_uid = this.determineTeamParentId(records, teamID, ctx);
        }
      } else {
        ctx.logger.warn(
          `Manager ID ${manager_id} not found in employee records`
        );
        // This is in the rare case where manager ID isn't in one of the employee records.
        // It can occur if the currently observed team is the root team in the org
        potential_root_teams.push(teamID);
      }
      teamIDToParentTeamID[teamID] = parent_team_uid;
    }
    if (potential_root_teams.length > 1) {
      ctx.logger.warn(
        `Found more than one potential root team: "${JSON.stringify(
          potential_root_teams
        )}"`
      );
    }

    return teamIDToParentTeamID;
  }

  private getAllEmployeeRecords(): EmployeeRecord[] {
    const allRecords: EmployeeRecord[] = [];
    for (const employeeID of Object.keys(this.employeeIDToRecords)) {
      allRecords.push(...this.employeeIDToRecords[employeeID]);
    }
    return allRecords;
  }
  private initializeTeamToParentWithInput(
    ctx: StreamContext
  ): Record<string, string> {
    const team_to_parent_map: Record<string, string> | null =
      ctx.config.source_specific_configs?.workday?.additional_team_info
        ?.team_id_to_parent_id;
    if (!team_to_parent_map) {
      ctx.logger.info('No team to parent map provided in config');
      return {};
    }
    // Check if team to parent is a record:
    if (typeof team_to_parent_map !== 'object') {
      throw new Error(
        `team_to_parent_list is not an object. Instead: ${typeof team_to_parent_map}`
      );
    }
    const teamIDToTeamName: Record<string, string> =
      ctx.config.source_specific_configs?.workday?.additional_team_info
        ?.team_id_to_name;
    if (teamIDToTeamName) {
      for (const [team_id, team_name] of Object.entries(teamIDToTeamName)) {
        this.teamIDToTeamName[team_id] = team_name;
      }
    }
    const map: Record<string, string> = {};
    for (const [team_id, parent_id] of Object.entries(team_to_parent_map)) {
      this.additionalTeamToParentInputs.add(team_id);
      this.additionalTeamToParentInputs.add(parent_id);
      map[team_id] = parent_id;
      if (!(team_id in this.teamIDToTeamName)) {
        this.teamIDToTeamName[team_id] = team_id;
      }
      if (!(parent_id in this.teamIDToTeamName)) {
        this.teamIDToTeamName[parent_id] = parent_id;
      }
    }
    // For every parent team, if it does not appear as a child to another team,
    // then it is assumed to be a root team
    for (const parentTeamID of Object.values(map)) {
      if (!(parentTeamID in map)) {
        map[parentTeamID] = this.FAROS_TEAM_ROOT;
      }
    }
    map[this.FAROS_TEAM_ROOT] = null;
    return map;
  }

  private computeTeamToParentTeamMappingUsingParentIDField(
    ctx: StreamContext,
    teamIDToParentTeamID: Record<string, string>
  ): Record<string, string> {
    ctx.logger.info('Computing team to parent mapping via Parent_Team_ID');
    const all_employee_records = this.getAllEmployeeRecords();
    const all_parent_team_ids = new Set<string>();
    for (const employeeRecord of all_employee_records) {
      if (!employeeRecord.Parent_Team_ID) {
        throw new Error(
          `Parent_Team_ID is missing for employee with ID ${employeeRecord.Employee_ID}`
        );
      }
      const TeamID = employeeRecord.Team_ID;
      const parentTeamID = employeeRecord.Parent_Team_ID;
      all_parent_team_ids.add(parentTeamID);
      if (TeamID in teamIDToParentTeamID) {
        if (parentTeamID != teamIDToParentTeamID[TeamID]) {
          const err_str = `More than one parent team ID for team ${TeamID}: ${parentTeamID} & ${teamIDToParentTeamID[TeamID]}`;
          ctx.logger.error(err_str);
          this.generalLogCollection.push(err_str);
        }
      } else {
        teamIDToParentTeamID[TeamID] = parentTeamID;
      }
    }
    for (const parentTeamID of all_parent_team_ids) {
      if (!(parentTeamID in teamIDToParentTeamID)) {
        teamIDToParentTeamID[parentTeamID] = this.FAROS_TEAM_ROOT;
      }
      if (!(parentTeamID in this.teamIDToTeamName)) {
        this.teamIDToTeamName[parentTeamID] = parentTeamID;
        const err_str = `Parent team ID ${parentTeamID} not found in team ID to team name mapping`;
        ctx.logger.error(err_str);
        this.generalLogCollection.push(err_str);
      }
    }
    return teamIDToParentTeamID;
  }

  private computeTeamToParentTeamMapping(
    ctx: StreamContext
  ): Record<string, string> {
    // initialize team To Parent Team ID mapping
    const teamIDToParentTeamID: Record<string, string> =
      this.initializeTeamToParentWithInput(ctx);
    if (ctx.config.source_specific_configs?.workday?.use_parent_team_id) {
      return this.computeTeamToParentTeamMappingUsingParentIDField(
        ctx,
        teamIDToParentTeamID
      );
    } else {
      return this.computeTeamToParentTeamMappingFromManagers(
        ctx,
        teamIDToParentTeamID
      );
    }
  }
  private computeOwnershipChain(
    elementId: string,
    allOrgId: string,
    teamIDToParentID: Record<string, string>
  ): {cycle: boolean; ownershipChain: ReadonlyArray<string>} {
    // In the case of a cycle, it means that the second to last
    // team in the cycle is has a parent that has been previously
    // seen in the chain. So we need to make it so the second to
    // last element in the chain points to the top team.
    // The length of the ownership chain will be at least
    // 2 if there is a cycle.
    // You must return this in ascending order left to right
    let id = elementId;
    const ownershipChain = [];
    const visited = new Set<string>();
    do {
      ownershipChain.push(id);
      if (visited.has(id)) {
        return {cycle: true, ownershipChain};
      }
      visited.add(id);

      id = teamIDToParentID[id];
    } while (id);

    ownershipChain.push(allOrgId);

    return {cycle: false, ownershipChain};
  }

  private setOrgsToKeepAndIgnore(ctx: StreamContext): [string[], string[]] {
    const org_ids_to_keep =
      ctx.config.source_specific_configs?.workday?.orgs_to_keep;
    const org_ids_to_ignore =
      ctx.config.source_specific_configs?.workday?.orgs_to_ignore;
    if (!org_ids_to_keep || !org_ids_to_ignore) {
      throw new Error(
        'org_ids_to_keep or org_ids_to_ignore missing from source specific configs'
      );
    }
    for (const org_id of org_ids_to_keep) {
      if (org_ids_to_ignore.includes(org_id)) {
        throw new Error(
          'Overlap between org_ids_to_keep and org_ids_to_ignore'
        );
      }
    }
    if (org_ids_to_keep.length == 0) {
      // we keep all teams
      org_ids_to_keep.push(this.FAROS_TEAM_ROOT);
    }
    // Setting the values
    this.org_ids_to_keep = org_ids_to_keep;
    this.org_ids_to_ignore = org_ids_to_ignore;
    return [org_ids_to_keep, org_ids_to_ignore];
  }

  private shouldKeepTeam(
    ownershipChain: ReadonlyArray<string>,
    cycle_exists: boolean,
    ctx: StreamContext
  ): boolean {
    // To determine whether a team is kept, we simply go up the ownership chain.
    // if we first hit an ignored team, we return false (not kept).
    // Otherwise if we first hit a kept team, we return true (keep the team)
    // If we hit neither kept nor ignored, we return false (not kept).
    // Addition: if we keep cycle teams and there is a cycle then we return true.
    for (const org of ownershipChain) {
      if (this.org_ids_to_keep.includes(org)) {
        return true;
      }
      if (this.org_ids_to_ignore.includes(org)) {
        return false;
      }
    }
    if (!ctx.config.source_specific_configs?.workday?.ignore_cycle_teams) {
      if (cycle_exists) {
        return true;
      }
    }
    return false;
  }

  private checkIfTeamIsAcceptable(
    team: string,
    teamIDToParentID: Record<string, string>,
    ctx: StreamContext
  ): boolean {
    // This continues the complicated logic which defines which teams to keep
    // We need to use the ownershipChain, which goes
    // from lowest in the tree to highest in the tree,
    // Left to Right, how to keep certain teams,
    // and to repoint them to their correct parent.
    const ownershipInfo = this.computeOwnershipChain(
      team,
      this.FAROS_TEAM_ROOT,
      teamIDToParentID
    );
    const ownershipChain: ReadonlyArray<string> = ownershipInfo.ownershipChain;
    if (ownershipInfo.cycle) {
      // Cycle found - this should mean ownershipChain exists with length greater than 1
      ctx.logger.info(JSON.stringify(ownershipChain));
      const fix_team = ownershipChain[ownershipChain.length - 2];
      teamIDToParentID[fix_team] = this.FAROS_TEAM_ROOT;
      this.cycleChains.push(ownershipChain);
    }
    return this.shouldKeepTeam(ownershipChain, ownershipInfo.cycle, ctx);
  }

  private getAcceptableTeams(
    teamIDToParentID: Record<string, string>,
    ctx: StreamContext
  ): Set<string> {
    // This is the entry point for the logic which defines which teams to keep
    // (ctx is included for potential debugging)
    ctx.logger.info('Getting Acceptable teams');
    const acceptableTeams = new Set<string>();
    ctx.logger.info('Computing ownership chains.');
    for (const team_id of Object.keys(teamIDToParentID)) {
      const include_bool = this.checkIfTeamIsAcceptable(
        team_id,
        teamIDToParentID,
        ctx
      );
      if (include_bool) {
        acceptableTeams.add(team_id);
      }
    }
    return acceptableTeams;
  }

  private printReport(ctx: StreamContext, acceptableTeams: Set<string>): void {
    const teamIDs = Object.keys(this.teamIDToManagerIDs);
    // Preparing to list employees with more than one record by their name
    const employees_with_more_than_one_record_by_name: Record<string, number> =
      {};
    for (const [employeeID, count] of Object.entries(
      this.employees_with_more_than_one_record_by_id
    )) {
      const employeeName = this.employeeIDToRecords[employeeID][0].Full_Name;
      employees_with_more_than_one_record_by_name[employeeName] = count;
    }
    const report_obj = {
      nAcceptableTeams: acceptableTeams.size,
      nOriginalTeams: teamIDs ? teamIDs.length : 0,
      records_skipped: this.recordCount.skippedRecords,
      numRecordsSkippedDueToMissingFields: this.skipped_due_to_missing_fields,
      failedRecordFields: Array.from(this.failedRecordFields.values()),
      numRecordsSkippedDueToTermination: this.skipped_due_to_termination,
      records_stored: this.recordCount.storedRecords,
      nCycleChains: this.cycleChains ? this.cycleChains.length : 0,
      employees_with_more_than_one_record_by_id:
        this.employees_with_more_than_one_record_by_id,
      employees_with_more_than_one_record_by_name,
      generalLogs: this.generalLogCollection,
    };
    ctx.logger.info('Report:');
    ctx.logger.info(JSON.stringify(report_obj));
    if (report_obj.nCycleChains > 0) {
      let error_str: string = 'Cycles found. Please note the issue. ';
      error_str +=
        'The cycle chains are listed in log message above, and here: ';
      error_str += JSON.stringify(this.cycleChains);
      ctx.logger.warn(error_str);
      if (ctx.config.source_specific_configs?.workday?.fail_on_cycles) {
        throw new Error(error_str);
      }
    }
  }

  getEmploymentType(employeeType: string): org_EmploymentType | null {
    if (!employeeType) {
      return null;
    }
    const fixedEmployeeType = employeeType.replace(/[\s-]/g, '').toLowerCase();
    let category = 'Custom';
    if (fixedEmployeeType === 'fulltime') {
      category = 'FullTime';
    } else if (fixedEmployeeType === 'parttime') {
      category = 'PartTime';
    } else if (fixedEmployeeType === 'contractor') {
      category = 'Contractor';
    } else if (fixedEmployeeType === 'intern') {
      category = 'Intern';
    } else if (fixedEmployeeType === 'freelance') {
      category = 'Freelance';
    }
    return {category, detail: employeeType};
  }

  getRecordsForDuplicateEmployee(
    employee_record: EmployeeRecord
  ): DestinationRecord[] {
    // When a single employee has several records associated with them (e.g. they are on multiple teams)
    // we need to handle this properly
    const all_employee_records: EmployeeRecord[] =
      this.employeeIDToRecords[employee_record.Employee_ID];
    const firstRecord = all_employee_records[0];
    const errors_log: string[] = [];

    // We don't error out because we don't want to stop the process
    // We just want to log the errors
    for (const record of all_employee_records) {
      if (record.Start_Date !== firstRecord.Start_Date) {
        errors_log.push(
          `Start Date mismatch for employee with duplicate records ${record.Employee_ID} (${record.Full_Name}): ${record.Start_Date} vs ${firstRecord.Start_Date}`
        );
      }
      if (record.Location !== firstRecord.Location) {
        errors_log.push(
          `Location mismatch for employee with duplicate records ${record.Employee_ID} (${record.Full_Name}): ${record.Location} vs ${firstRecord.Location}`
        );
      }
      if (record.Email !== firstRecord.Email) {
        errors_log.push(
          `Email mismatch for employee with duplicate records ${record.Employee_ID} (${record.Full_Name}): ${record.Email} vs ${firstRecord.Email}`
        );
      }
    }
    this.generalLogCollection.push(...errors_log);
    return [
      {
        model: 'org_TeamMembership',
        record: {
          team: {uid: employee_record.Team_ID},
          member: {uid: employee_record.Employee_ID},
        },
      },
    ];
  }

  private async createEmployeeRecordList(
    employee_record: EmployeeRecord,
    isTerminated: boolean = false
  ): Promise<DestinationRecord[]> {
    // org_Employee, identity_Identity, geo_Location, org_TeamMembership
    const records = [];
    let inactive = false;
    let teamUid = employee_record.Team_ID;
    let managerKey = {uid: employee_record.Manager_ID};
    let terminatedAt = null;
    if (isTerminated) {
      inactive = true;
      teamUid = this.FAROS_UNASSIGNED_TEAM;
      managerKey = null;
      terminatedAt = this.getTerminationDate(employee_record);
    }
    if (employee_record.Employee_ID in this.writtenEmployeeIds) {
      // We only return the team membership record
      return this.getRecordsForDuplicateEmployee(employee_record);
    }
    records.push(
      {
        model: 'org_Employee',
        record: {
          uid: employee_record.Employee_ID,
          joinedAt: employee_record.Start_Date,
          terminatedAt,
          inactive,
          manager: managerKey,
          identity: {uid: employee_record.Employee_ID},
          location: await this.locationCollector.collect(
            employee_record.Location
          ),
          title: employee_record.Job_Title,
          employmentType: this.getEmploymentType(employee_record.Employee_Type),
        },
      },
      {
        model: 'identity_Identity',
        record: {
          uid: employee_record.Employee_ID,
          fullName: employee_record.Full_Name,
          emails: employee_record.Email ? [employee_record.Email] : null,
          primaryEmail: employee_record.Email ? employee_record.Email : '',
        },
      },
      {
        model: 'org_TeamMembership',
        record: {
          team: {uid: teamUid},
          member: {uid: employee_record.Employee_ID},
        },
      }
    );
    this.writtenEmployeeIds.add(employee_record.Employee_ID);

    return records;
  }

  private createOrgTeamRecord(
    teamID: string,
    teamIDToParentID: Record<string, string>,
    ctx: StreamContext
  ): DestinationRecord {
    // Only an input list team
    if (this.additionalTeamToParentInputs.has(teamID)) {
      return {
        model: 'org_Team',
        record: {
          uid: teamID,
          name: this.teamIDToTeamName[teamID],
          parentTeam: {uid: teamIDToParentID[teamID]},
        },
      };
    }
    // Standard teams
    const manager_id = this.getManagerIDFromList(
      this.teamIDToManagerIDs[teamID],
      ctx
    );
    return {
      model: 'org_Team',
      record: {
        uid: teamID,
        name: this.teamIDToTeamName[teamID],
        lead: manager_id ? {uid: manager_id} : null,
        parentTeam: {uid: teamIDToParentID[teamID]},
      },
    };
  }

  private replaceTeamParents(
    acceptable_teams: Set<string>,
    teamIDToParentID: Record<string, string>
  ): Record<string, string> {
    // Within this function we use the new acceptable teams set to
    // ensure team's parents are within the system.
    const newTeamToParent: Record<string, string> = {};
    for (const team of acceptable_teams) {
      const seenParentTeams: Set<string> = new Set<string>();
      let parent_team = teamIDToParentID[team];
      while (parent_team && !acceptable_teams.has(parent_team)) {
        if (seenParentTeams.has(parent_team)) {
          let err_str = `Cycle found in team Parent Replace function. Team: "${parent_team}". `;
          err_str += `All teams: ${JSON.stringify([...seenParentTeams])}`;
          err_str += `Please reach out to Faros Support.`;
          throw new Error(err_str);
        }
        seenParentTeams.add(parent_team);
        parent_team = teamIDToParentID[parent_team];
      }
      if (parent_team) {
        newTeamToParent[team] = parent_team;
      } else {
        newTeamToParent[team] = this.FAROS_TEAM_ROOT;
      }
    }
    return newTeamToParent;
  }

  // This method is used during testing
  setField(fieldName: string, value: any): void {
    this[fieldName] = value;
  }

  async generateFinalRecords(
    ctx: StreamContext
  ): Promise<[ReadonlyArray<DestinationRecord>, Record<string, string>]> {
    // Class fields required to be filled (reference for testing):
    // recordCount, teamIDToManagerIDs, employeeIDToRecords
    // FAROS_TEAM_ROOT, cycleChains, generalLogCollection
    const res: DestinationRecord[] = [];
    const teamIDToParentID: Record<string, string> =
      this.computeTeamToParentTeamMapping(ctx);

    this.locationCollector = new LocationCollector(
      ctx?.config?.source_specific_configs?.workday?.resolve_locations,
      ctx?.farosClient
    );

    // Here we get a set of teams to keep
    // This is the entry point to the densest logical aspect of the connector
    const acceptable_teams: Set<string> = this.getAcceptableTeams(
      teamIDToParentID,
      ctx
    );
    ctx.logger.info(
      'Got acceptable teams and computed team to parent team mapping.'
    );
    ctx.logger.info('Finished computing ownership chains.');

    const newTeamToParent: Record<string, string> = this.replaceTeamParents(
      acceptable_teams,
      teamIDToParentID
    );

    for (const team of acceptable_teams) {
      if (team != 'all_teams') {
        res.push(this.createOrgTeamRecord(team, newTeamToParent, ctx));
      }
    }
    for (const employeeID of Object.keys(this.employeeIDToRecords)) {
      const employeeRecords: EmployeeRecord[] =
        this.employeeIDToRecords[employeeID];
      for (const employeeRecord of employeeRecords) {
        if (acceptable_teams.has(employeeRecord.Team_ID)) {
          res.push(...(await this.createEmployeeRecordList(employeeRecord)));
        }
      }
    }
    for (const terminatedEmployee of this.terminatedEmployees) {
      res.push(
        ...(await this.createEmployeeRecordList(terminatedEmployee, true))
      );
    }
    this.printReport(ctx, acceptable_teams);
    return [res, newTeamToParent];
  }

  async onProcessingComplete(
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    ctx.logger.info(
      `Starting 'onProcessingComplete'. Records skipped: '${this.recordCount.skippedRecords}',` +
        ` records kept: '${this.recordCount.storedRecords}'.`
    );
    // Checking orgs to keep / ignore
    this.setOrgsToKeepAndIgnore(ctx);
    const [res, finalTeamToParent] = await this.generateFinalRecords(ctx);
    ctx.logger.debug(
      `final team to parent mapping: ${JSON.stringify(finalTeamToParent)}`
    );
    return [...res, ...this.locationCollector.convertLocations()];
  }
}
