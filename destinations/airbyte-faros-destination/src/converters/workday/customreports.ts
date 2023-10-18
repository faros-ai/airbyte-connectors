import {AirbyteRecord} from 'faros-airbyte-cdk';
import {DateTime} from 'luxon';

import {
  Converter,
  DestinationModel,
  DestinationRecord,
  StreamContext,
} from '../converter';
import {EmployeeRecord, ManagerTimeRecord} from './models';

export class Customreports extends Converter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'org_Employee',
    'identity_Identity',
    'geo_Location',
    'org_TeamMembership',
    'org_Team',
  ];
  source = 'Customreports';
  private employeeIDtoRecord: Record<string, EmployeeRecord> = {};
  private teamNameToManagerIDs: Record<string, ManagerTimeRecord[]> = {};
  private recordCount = {
    skippedRecords: 0,
    storedRecords: 0,
  };
  FAROS_TEAM_ROOT = 'all_teams';

  /** Almost every SquadCast record have id property */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.Empoyee_Id;
  }

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
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
      this.checkIfTime1GreaterThanTime2(rec.Start_Date, crt_last_rec.Timestamp)
    ) {
      this.teamNameToManagerIDs[rec.Team_Name].push({
        Manager_ID: rec.Manager_ID,
        Timestamp: rec.Start_Date,
      });
    }
    return;
  }

  private checkIfTime1GreaterThanTime2(time1: Date, time2: Date): boolean {
    if (time1 > time2) {
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

  private computeTeamToParentTeamMapping(
    ctx: StreamContext
  ): Record<string, string> {
    const teamNameToParentTeamName: Record<string, string> = {};
    teamNameToParentTeamName[this.FAROS_TEAM_ROOT] = null;
    const potential_root_teams: string[] = [];
    for (const [teamName, recs] of Object.entries(this.teamNameToManagerIDs)) {
      const last_record: ManagerTimeRecord = recs[recs.length - 1];
      const manager_id: string = last_record.Manager_ID;
      let parent_team_uid: string = this.FAROS_TEAM_ROOT;
      if (manager_id in this.employeeIDtoRecord) {
        // This is the expected case
        parent_team_uid =
          this.employeeIDtoRecord[last_record.Manager_ID].Team_Name;
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
    return acceptableTeams;
  }

  async onProcessingComplete(
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    ctx.logger.info(
      `Starting 'onProcessingComplete'. Records skipped: '${this.recordCount.skippedRecords}',` +
        ` records kept: '${this.recordCount.storedRecords}'.`
    );
    const teamToParent: Record<string, string> =
      this.computeTeamToParentTeamMapping(ctx);
    // Here we need to get a list of teams to keep
    const acceptable_teams = this.getAcceptableTeams(teamToParent);

    return [];
  }
}
