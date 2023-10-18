import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {
  Converter,
  DestinationModel,
  DestinationRecord,
  StreamContext,
} from '../converter';
import {EmployeeRecord, ManagerTimeRecord} from './models';

export class Customreports extends Converter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'org_Team',
    'org_Employee',
    'identity_Identity',
    'geo_Location',
    'org_TeamMembership',
  ];
  source = 'Customreports';
  private employeeIDtoRecord: Record<string, EmployeeRecord> = {};
  private teamNameToManagerIDs: Record<string, ManagerTimeRecord[]> = {};
  private recordCount = {
    skippedRecords: 0,
    storedRecords: 0,
  };
  private cycleChains: ReadonlyArray<string>[] = [];
  FAROS_TEAM_ROOT = 'all_teams';
  // TODO: Replace these two with config variables
  private orgs_to_save = ['a', 'b', 'c'];
  private orgs_to_block = ['d', 'e', 'f'];

  private replacedParentTeams: string[] = [];
  private seenLocations: Set<string> = new Set<string>();

  /** Almost every SquadCast record have id property */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.Empoyee_Id;
  }

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const res: DestinationRecord[] = [];
    //const source = this.source;
    const rec = record.record.data as EmployeeRecord;
    if (!this.checkRecordValidity(rec)) {
      this.recordCount.skippedRecords += 1;
      return res;
    }

    this.recordCount.storedRecords += 1;
    this.extractRecordInfo(rec);

    return res;
  }

  private extractRecordInfo(rec: EmployeeRecord): void {
    // Extracts information from record to class structures
    // in order to be used once all records are processed
    this.employeeIDtoRecord[rec.Employee_ID] = rec;
    this.updateTeamToManagerRecord(rec);
  }
  private updateTeamToManagerRecord(rec: EmployeeRecord): void {
    // We store all the possible Manager IDs for a Team,
    // The last one in the list will be the most recent time.

    // We check if the Team Name happens to be FAROS_TEAM_ROOT.
    // If this is the case, then the rest of the processing won't work.
    if (rec.Team_Name == this.FAROS_TEAM_ROOT) {
      let error_str = `Record team name is the same as Faros Team Root, ${this.FAROS_TEAM_ROOT}:`;
      error_str += `Record: ${JSON.stringify(rec)}`;
      throw new Error(error_str);
    }

    // Here we check if we've already stored info for this Team Name:
    if (!(rec.Team_Name in this.teamNameToManagerIDs)) {
      this.teamNameToManagerIDs[rec.Team_Name] = [
        {Manager_ID: rec.Manager_ID, Timestamp: rec.Start_Date},
      ];
      return;
    }
    const recs_list = this.teamNameToManagerIDs[rec.Team_Name];
    const crt_last_rec = recs_list[recs_list.length - 1];
    if (crt_last_rec.Manager_ID === rec.Manager_ID) {
      return;
    }
    // TODO: Double check that the Start_Date value is recorded as a string
    if (
      this.checkIfTime1GreaterThanTime2(
        Utils.toDate(rec.Start_Date),
        Utils.toDate(crt_last_rec.Timestamp)
      )
    ) {
      this.teamNameToManagerIDs[rec.Team_Name].push({
        Manager_ID: rec.Manager_ID,
        Timestamp: rec.Start_Date,
      });
    }
    return;
  }

  private checkIfTime1GreaterThanTime2(time1: Date, time2: Date): boolean {
    if (time1.getTime() > time2.getTime()) {
      return true;
    } else {
      return false;
    }
  }

  private checkRecordValidity(rec: EmployeeRecord): boolean {
    if (
      !rec.Employee_ID ||
      !rec.Full_Name ||
      !rec.Manager_ID ||
      !rec.Manager_Name ||
      !rec.Start_Date ||
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
    const last_record: ManagerTimeRecord = recs[recs.length - 1];
    const manager_id: string = last_record.Manager_ID;
    return manager_id;
  }

  private computeTeamToParentTeamMapping(
    ctx: StreamContext
  ): Record<string, string> {
    const teamNameToParentTeamName: Record<string, string> = {};
    teamNameToParentTeamName[this.FAROS_TEAM_ROOT] = null;
    const potential_root_teams: string[] = [];
    for (const [teamName, recs] of Object.entries(this.teamNameToManagerIDs)) {
      const manager_id = this.getManagerIDFromList(recs);
      let parent_team_uid: string = this.FAROS_TEAM_ROOT;
      if (manager_id in this.employeeIDtoRecord) {
        // This is the expected case
        parent_team_uid = this.employeeIDtoRecord[manager_id].Team_Name;
      } else {
        // This is in the rare case where manager ID isn't in one of the employee records.
        // It can occur if the currently observed team is the root team in the org
        potential_root_teams.push(teamName);
      }
      teamNameToParentTeamName[teamName] = parent_team_uid;
    }
    if (potential_root_teams.length > 1) {
      ctx.logger.warn(
        `Found more than one potential root team: "${JSON.stringify(
          potential_root_teams
        )}"`
      );
    }

    return teamNameToParentTeamName;
  }
  private computeOwnershipChain(
    elementId: string,
    allOrgId: string,
    teamToParent: Record<string, string>
  ): {cycle: boolean; ownershipChain: ReadonlyArray<string>} {
    // In the case of a cycle, it means that the second to last
    // team in the cycle is has a parent that has been previously
    // seen in the chain. So we need to make it so the second to
    // last element in the chain points to the top team.
    // The length of the ownership chain will be at least
    // 2 if there is a cycle.
    let id = elementId;
    const ownershipChain = [];
    const visited = new Set<string>();
    do {
      ownershipChain.push(id);
      if (visited.has(id)) {
        return {cycle: true, ownershipChain};
      }
      visited.add(id);

      const element = teamToParent[id];
      if (!element) break;
      id = element;
    } while (id);

    ownershipChain.push(allOrgId);

    return {cycle: false, ownershipChain};
  }

  private getAcceptableTeams(
    teamToParent: Record<string, string>
  ): Set<string> {
    // TODO: implement this function
    const acceptableTeams = new Set<string>();
    for (const team of Object.keys(teamToParent)) {
      const ownershipInfo = this.computeOwnershipChain(
        team,
        this.FAROS_TEAM_ROOT,
        teamToParent
      );
      const ownershipChain: ReadonlyArray<string> =
        ownershipInfo.ownershipChain;
      if (ownershipInfo.cycle) {
        // Cycle found
        const fix_team = ownershipChain[ownershipChain.length - 2];
        teamToParent[fix_team] = this.FAROS_TEAM_ROOT;
        this.cycleChains.push(ownershipChain);
      }
      let include_bool = false;
      for (const used_org in this.orgs_to_save) {
        if (ownershipChain.includes(used_org)) {
          include_bool = true;
        }
      }
      for (const block_org in this.orgs_to_block) {
        if (ownershipChain.includes(block_org)) {
          include_bool = false;
        }
      }
      if (include_bool) {
        acceptableTeams.add(team);
      }
    }
    for (const team of acceptableTeams) {
      const parent_team = teamToParent[team];
      if (!acceptableTeams.has(parent_team)) {
        teamToParent[team] = this.FAROS_TEAM_ROOT;
        this.replacedParentTeams.push(team);
      }
    }
    return acceptableTeams;
  }

  private printReport(ctx: StreamContext, acceptableTeams: Set<string>): void {
    const report_obj = {
      nAcceptableTeams: acceptableTeams.size,
      nOriginalTeams: Object.keys(this.teamNameToManagerIDs).length,
      records_skipped: this.recordCount.skippedRecords,
      records_stored: this.recordCount.storedRecords,
    };
    ctx.logger.info('Report:');
    ctx.logger.info(JSON.stringify(report_obj));
  }

  private createEmployeeRecordList(
    employeeID: string,
    acceptable_teams: Set<string>
  ): DestinationRecord[] {
    // org_Employee, identity_Identity, geo_Location, org_TeamMembership
    const records = [];
    const employee_record: EmployeeRecord = this.employeeIDtoRecord[employeeID];
    if (!acceptable_teams.has(employee_record.Team_Name)) {
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
        },
      },
      {
        model: 'identity_Identity',
        record: {
          uid: employee_record.Employee_ID,
          fullName: employee_record.Full_Name,
          emails: employee_record.Email ? [employee_record.Email] : null,
        },
      },
      {
        model: 'org_TeamMembership',
        record: {
          team: {uid: employee_record.Team_Name},
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
    team: string,
    teamToParent: Record<string, string>
  ): DestinationRecord {
    const manager_id = this.getManagerIDFromList(
      this.teamNameToManagerIDs[team]
    );
    return {
      model: 'org_Team',
      record: {
        uid: team,
        name: team,
        lead: {uid: manager_id},
        parentTeam: {uid: teamToParent[team]},
      },
    };
  }

  async onProcessingComplete(
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const res: DestinationRecord[] = [];
    ctx.logger.info(
      `Starting 'onProcessingComplete'. Records skipped: '${this.recordCount.skippedRecords}',` +
        ` records kept: '${this.recordCount.storedRecords}'.`
    );
    const teamToParent: Record<string, string> =
      this.computeTeamToParentTeamMapping(ctx);
    // Here we need to get a list of teams to keep
    const acceptable_teams: Set<string> = this.getAcceptableTeams(teamToParent);
    for (const team of acceptable_teams) {
      res.push(this.createOrgTeamRecord(team, teamToParent));
    }
    for (const employeeID of Object.keys(this.employeeIDtoRecord)) {
      res.push(...this.createEmployeeRecordList(employeeID, acceptable_teams));
    }
    this.printReport(ctx, acceptable_teams);
    return res;
  }
}
