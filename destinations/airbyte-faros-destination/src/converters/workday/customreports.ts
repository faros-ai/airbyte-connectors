import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

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
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'org_Team',
    'org_Employee',
    'identity_Identity',
    'geo_Location',
    'org_TeamMembership',
  ];
  source = 'workday';
  FAROS_TEAM_ROOT = 'all_teams';
  recordCount = {
    skippedRecords: 0,
    storedRecords: 0,
  };
  employeeIDtoRecord: Record<string, EmployeeRecord> = {};
  teamIDToManagerIDs: Record<string, ManagerTimeRecord[]> = {};
  teamIDToTeamName: Record<string, string> = {
    all_teams: 'all_teams',
    unassigned: 'Unassigned',
  };
  cycleChains: ReadonlyArray<string>[] = [];
  replacedParentTeams: string[] = [];
  seenLocations: Set<string> = new Set<string>();
  generalLogCollection: string[] = [];
  // These are set in setOrgsToKeepAndIgnore
  org_ids_to_keep = null;
  org_ids_to_ignore = null;

  /** Almost every SquadCast record have id property */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.Employee_Id;
  }

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const rec = record.record.data as EmployeeRecord;
    if (!this.checkRecordValidity(rec)) {
      this.recordCount.skippedRecords += 1;
    } else {
      this.recordCount.storedRecords += 1;
      this.extractRecordInfo(rec);
    }
    return [];
  }

  private extractRecordInfo(rec: EmployeeRecord): void {
    // Extracts information from record to class structures
    // in order to be used once all records are processed
    this.employeeIDtoRecord[rec.Employee_ID] = rec;
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

  private checkRecordValidity(rec: EmployeeRecord): boolean {
    rec = this.convertRecordToStandardizedForm(rec);
    if (
      !rec.Employee_ID ||
      !rec.Full_Name ||
      !rec.Manager_ID ||
      !rec.Start_Date ||
      !rec.Team_ID ||
      !rec.Team_Name
    ) {
      return false;
    }
    // We're only keeping active records
    if (rec.Termination_Date) {
      return false;
    }
    return true;
  }

  private getManagerIDFromList(recs: ManagerTimeRecord[]): string {
    if (!recs) {
      throw new Error('Missing recs');
    }
    const last_record: ManagerTimeRecord = recs[recs.length - 1];
    const manager_id: string = last_record.Manager_ID;
    return manager_id;
  }

  private computeTeamToParentTeamMapping(
    ctx: StreamContext
  ): Record<string, string> {
    ctx.logger.info('Computing team to parent mapping');
    const teamIDToParentTeamID: Record<string, string> = {};
    teamIDToParentTeamID[this.FAROS_TEAM_ROOT] = null;
    const potential_root_teams: string[] = [];
    for (const [teamID, recs] of Object.entries(this.teamIDToManagerIDs)) {
      const manager_id = this.getManagerIDFromList(recs);
      if (!manager_id) {
        this.generalLogCollection.push(
          `Failed to get manager id for team ${teamID}`
        );
        teamIDToParentTeamID[teamID] = this.FAROS_TEAM_ROOT;
        continue;
      }
      let parent_team_uid: string = this.FAROS_TEAM_ROOT;
      if (manager_id in this.employeeIDtoRecord) {
        // This is the expected case
        parent_team_uid = this.employeeIDtoRecord[manager_id].Team_ID;
      } else {
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
    const report_obj = {
      nAcceptableTeams: acceptableTeams.size,
      nOriginalTeams: teamIDs ? teamIDs.length : 0,
      records_skipped: this.recordCount.skippedRecords,
      records_stored: this.recordCount.storedRecords,
      nCycleChains: this.cycleChains ? this.cycleChains.length : 0,
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

  private createEmployeeRecordList(
    employeeID: string,
    acceptable_teams: Set<string>
  ): DestinationRecord[] {
    // org_Employee, identity_Identity, geo_Location, org_TeamMembership
    const records = [];
    const employee_record: EmployeeRecord = this.employeeIDtoRecord[employeeID];
    if (!acceptable_teams.has(employee_record.Team_ID)) {
      return records;
    }
    records.push(
      {
        model: 'org_Employee',
        record: {
          uid: employee_record.Employee_ID,
          joinedAt: employee_record.Start_Date,
          inactive: false,
          manager: {uid: employee_record.Manager_ID},
          identity: {uid: employee_record.Employee_ID},
          location: employee_record.Location
            ? {uid: employee_record.Location}
            : null,
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
          team: {uid: employee_record.Team_ID},
          member: {uid: employee_record.Employee_ID},
        },
      }
    );
    if (
      employee_record.Location &&
      !this.seenLocations.has(employee_record.Location)
    ) {
      records.push({
        model: 'geo_Location',
        record: {
          uid: employee_record.Location,
        },
      });
      this.seenLocations.add(employee_record.Location);
    }

    return records;
  }

  private createOrgTeamRecord(
    teamID: string,
    teamIDToParentID: Record<string, string>
  ): DestinationRecord {
    const manager_id = this.getManagerIDFromList(
      this.teamIDToManagerIDs[teamID]
    );
    return {
      model: 'org_Team',
      record: {
        uid: teamID,
        name: this.teamIDToTeamName[teamID],
        lead: {uid: manager_id},
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

  generateFinalRecords(
    ctx: StreamContext
  ): [ReadonlyArray<DestinationRecord>, Record<string, string>] {
    // Class fields required to be filled (reference for testing):
    // recordCount, teamIDToManagerIDs, employeeIDtoRecord
    // FAROS_TEAM_ROOT, cycleChains, generalLogCollection
    const res: DestinationRecord[] = [];
    const teamIDToParentID: Record<string, string> =
      this.computeTeamToParentTeamMapping(ctx);

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
        res.push(this.createOrgTeamRecord(team, newTeamToParent));
      }
    }
    for (const employeeID of Object.keys(this.employeeIDtoRecord)) {
      res.push(...this.createEmployeeRecordList(employeeID, acceptable_teams));
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
    const [res, finalTeamToParent] = this.generateFinalRecords(ctx);
    ctx.logger.debug(
      `final team to parent mapping: ${JSON.stringify(finalTeamToParent)}`
    );
    return res;
  }
}
