import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {
  Converter,
  DestinationModel,
  DestinationRecord,
  StreamContext,
} from '../converter';
import {EmployeeRecord, ManagerTimeRecord, recordKeyTyping} from './models';

export class Customreports extends Converter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'org_Team',
    'org_Employee',
    'identity_Identity',
    'geo_Location',
    'org_TeamMembership',
  ];
  source = 'workday';
  private employeeIDtoRecord: Record<string, EmployeeRecord> = {};
  private teamNameToManagerIDs: Record<string, ManagerTimeRecord[]> = {};
  private recordCount = {
    skippedRecords: 0,
    storedRecords: 0,
  };
  private cycleChains: ReadonlyArray<string>[] = [];
  FAROS_TEAM_ROOT = 'all_teams';

  private replacedParentTeams: string[] = [];
  private seenLocations: Set<string> = new Set<string>();
  private generalLogCollection: string[] = [];

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
  }
  private updateTeamToManagerRecord(rec: EmployeeRecord): void {
    // We store all the possible Manager IDs for a Team,
    // The last one in the list will be the most recent time.

    // We check if the Team Name happens to be FAROS_TEAM_ROOT.
    // If this is the case, then the rest of the processing won't work.
    if (rec.Team_Name === this.FAROS_TEAM_ROOT) {
      let error_str = `Record team name is the same as Faros Team Root, ${this.FAROS_TEAM_ROOT}:`;
      error_str += `Record: ${JSON.stringify(rec)}`;
      throw new Error(error_str);
    }

    // Here we check if we haven't yet stored info for this Team Name:
    if (!(rec.Team_Name in this.teamNameToManagerIDs)) {
      this.teamNameToManagerIDs[rec.Team_Name] = [
        {Manager_ID: rec.Manager_ID, Timestamp: rec.Start_Date},
      ];
      return;
    }

    // We have already stored info for this team. This should be a list
    const recs_list = this.teamNameToManagerIDs[rec.Team_Name];

    const crt_last_rec = recs_list[recs_list.length - 1];
    if (crt_last_rec.Manager_ID === rec.Manager_ID) {
      return;
    }

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
  }

  private checkIfTime1GreaterThanTime2(time1: Date, time2: Date): boolean {
    if (time1.getTime() > time2.getTime()) {
      return true;
    } else {
      return false;
    }
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

      const element = teamToParent[id];
      if (!element) break;
      id = element;
    } while (id);

    ownershipChain.push(allOrgId);

    return {cycle: false, ownershipChain};
  }

  private getOrgsToKeepAndIgnore(ctx: StreamContext): [string[], string[]] {
    const orgs_to_keep =
      ctx.config.source_specific_configs?.workday?.orgs_to_keep;
    const orgs_to_ignore =
      ctx.config.source_specific_configs?.workday?.orgs_to_ignore;
    if (!orgs_to_keep || !orgs_to_ignore) {
      throw new Error(
        'orgs_to_keep or orgs_to_ignore missing from source specific configs'
      );
    }
    for (const org of orgs_to_keep) {
      if (orgs_to_ignore.includes(org)) {
        throw new Error('Overlap between orgs_to_keep and orgs_to_ignore');
      }
    }
    if (orgs_to_keep.length == 0) {
      // we keep all teams
      orgs_to_keep.push(this.FAROS_TEAM_ROOT);
    }
    return [orgs_to_keep, orgs_to_ignore];
  }

  private pushInfoToLog(
    ownershipChain,
    orgs_to_keep_ixs,
    orgs_to_ignore_ixs,
    teamToParent
  ): void {
    this.generalLogCollection.push(
      `Running special KeepCase for team ${ownershipChain[0]}`
    );
    this.generalLogCollection.push(`keep ` + JSON.stringify(orgs_to_keep_ixs));
    this.generalLogCollection.push(
      `ignore ` + JSON.stringify(orgs_to_ignore_ixs)
    );
    this.generalLogCollection.push(
      `ownership Chain ` + JSON.stringify(ownershipChain)
    );
    this.generalLogCollection.push(
      `current parent ${teamToParent[ownershipChain[0]]}`
    );
    this.generalLogCollection.push(
      `Completed logs for team ${ownershipChain[0]}`
    );
  }

  private specialKeepCase(
    ownershipChain,
    orgs_to_keep_ixs,
    orgs_to_ignore_ixs,
    teamToParent
  ): void {
    // Within this function, we find how to replace the kept team's parent to the correct one
    // Note that the min index of an org kept in the chain is lower than min ignored
    this.pushInfoToLog(
      ownershipChain,
      orgs_to_keep_ixs,
      orgs_to_ignore_ixs,
      teamToParent
    );

    // If the 'kept' team isn't the first team in the chain, we can ignore replacement
    if (ownershipChain[orgs_to_keep_ixs[0]] != ownershipChain[0]) {
      return;
    }

    // If the only keep team in the chain is this team, we point it to the root
    if (orgs_to_keep_ixs.length == 1) {
      teamToParent[ownershipChain[0]] = this.FAROS_TEAM_ROOT;
      return;
    }

    const next_keep = orgs_to_keep_ixs[1];
    const min_ignore = orgs_to_ignore_ixs[0];

    // If the next closest keep team is less than the next ignore, we do nothing
    if (next_keep < min_ignore) {
      return;
    }

    // Now we have to iterate through the ignore indeces and search for
    // when they cross the 'next_keep'
    let cross_ix = null;
    for (let i = 0; i < orgs_to_ignore_ixs.length; i++) {
      if (orgs_to_ignore_ixs[i] > next_keep) {
        cross_ix = i;
        break;
      }
    }

    // In the case where cross_ix was never found, this means that the next keep
    // org is a parent of all of the ignored orgs, and we can set the parent of
    // the current team to be the parent of the max ignored org.
    if (!cross_ix) {
      teamToParent[ownershipChain[0]] =
        ownershipChain[orgs_to_ignore_ixs[orgs_to_ignore_ixs.length - 1] + 1];
      return;
    }

    // Otherwise, the cross index is the first index in which ignore is reached.
    // We find the next ignore down the tree and point to its parent
    teamToParent[ownershipChain[0]] =
      ownershipChain[orgs_to_ignore_ixs[cross_ix - 1] + 1];
  }

  private KeepTeamLogicNew(
    ownershipChain,
    orgs_to_keep,
    orgs_to_ignore
  ): boolean {
    // To determine whether a team is kept, we simply go up the ownership chain.
    // if we first hit an ignored team, we return false (not kept).
    // Otherwise if we first hit a kept team, we return true (keep the team)
    // If we hit neither kept nor ignored, we return false (not kept).
    for (let i = 0; i < ownershipChain.length; i++) {
      const org = ownershipChain[i];
      if (orgs_to_keep.includes(org)) {
        return true;
      }
      if (orgs_to_ignore.includes(org)) {
        return false;
      }
    }
    return false;
  }

  // private KeepTeamLogic(
  //   team,
  //   ownershipChain,
  //   orgs_to_keep,
  //   orgs_to_ignore,
  //   teamToParent
  // ): boolean {
  //   // This continues the complicated logic which defines which teams to keep
  //   // Ownership Chain lists teams up to root, e.g.
  //   // ['C', 'B', 'A', 'all_teams', 'all_teams']
  //   //let definite_false = false;
  //   //let definite_true = false;
  //   //let bottom_keep = null;
  //   //let switchParentPossible = false;
  //   //let last_keep_org = null;
  //   const orgs_to_keep_ixs: number[] = [];
  //   const orgs_to_ignore_ixs: number[] = [];
  //   for (let i = 0; i < ownershipChain.length; i++) {
  //     const org = ownershipChain[i];
  //     if (orgs_to_keep.includes(org)) {
  //       orgs_to_keep_ixs.push(i);
  //     }
  //     if (orgs_to_ignore.includes(org)) {
  //       orgs_to_ignore_ixs.push(i);
  //     }
  //   }
  //   // No orgs to keep in chain
  //   if (orgs_to_keep_ixs.length == 0) {
  //     return false;
  //   }
  //   // There is an org to keep but no orgs to ignore
  //   if (orgs_to_ignore_ixs.length == 0) {
  //     return true;
  //   }
  //   // Note for the following we have both keep and ignore
  //   const min_keep_ix = orgs_to_keep_ixs[0];
  //   const min_ignore_ix = orgs_to_ignore_ixs[0];
  //   if (min_ignore_ix < min_keep_ix) {
  //     // The closest parent to the team is ignored
  //     return false;
  //   } else if (min_ignore_ix == min_keep_ix) {
  //     throw new Error(
  //       `Keep and ignore teams are the same: ${ownershipChain[min_ignore_ix]}`
  //     );
  //   }
  //   // We have a special case where included is underneath an ignored team
  //   this.specialKeepCase(
  //     ownershipChain,
  //     orgs_to_keep_ixs,
  //     orgs_to_ignore_ixs,
  //     teamToParent
  //   );
  //   return true;
  // }

  private checkIfTeamIsAcceptable(
    team: string,
    teamToParent: Record<string, string>,
    ctx: StreamContext,
    orgs_to_keep: string[],
    orgs_to_ignore: string[]
  ): boolean {
    // This continues the complicated logic which defines which teams to keep
    // We need to use the ownershipChain, which goes
    // from lowest in the tree to highest in the tree,
    // Left to Right, how to keep certain teams,
    // and to repoint them to their correct parent.
    const ownershipInfo = this.computeOwnershipChain(
      team,
      this.FAROS_TEAM_ROOT,
      teamToParent
    );
    const ownershipChain: ReadonlyArray<string> = ownershipInfo.ownershipChain;
    if (ownershipInfo.cycle) {
      // Cycle found - this should mean ownershipChain exists with length greater than 1
      ctx.logger.info(JSON.stringify(ownershipChain));
      const fix_team = ownershipChain[ownershipChain.length - 2];
      teamToParent[fix_team] = this.FAROS_TEAM_ROOT;
      this.cycleChains.push(ownershipChain);
    }
    return this.KeepTeamLogicNew(ownershipChain, orgs_to_keep, orgs_to_ignore);
  }

  private getAcceptableTeams(
    teamToParent: Record<string, string>,
    ctx: StreamContext
  ): Set<string> {
    // This is the entry point for the logic which defines which teams to keep
    // (ctx is included for potential debugging)
    ctx.logger.info('Getting Acceptable teams');
    const acceptableTeams = new Set<string>();
    const [orgs_to_keep, orgs_to_ignore] = this.getOrgsToKeepAndIgnore(ctx);
    ctx.logger.info('Computing ownership chains.');
    for (const team of Object.keys(teamToParent)) {
      const include_bool = this.checkIfTeamIsAcceptable(
        team,
        teamToParent,
        ctx,
        orgs_to_keep,
        orgs_to_ignore
      );
      if (include_bool) {
        acceptableTeams.add(team);
      }
    }
    return acceptableTeams;
  }

  private printReport(ctx: StreamContext, acceptableTeams: Set<string>): void {
    const teamNames = Object.keys(this.teamNameToManagerIDs);
    const report_obj = {
      nAcceptableTeams: acceptableTeams.size,
      nOriginalTeams: teamNames ? teamNames.length : 0,
      records_skipped: this.recordCount.skippedRecords,
      records_stored: this.recordCount.storedRecords,
      cycleChains: this.cycleChains,
      generalLogs: this.generalLogCollection,
    };
    ctx.logger.info('Report:');
    ctx.logger.info(JSON.stringify(report_obj));
    if (this.cycleChains.length > 0) {
      let error_str: string = 'Cycles found. Please address the issue. ';
      error_str +=
        'The cycle chains are listed in log message above, and here: ';
      error_str += JSON.stringify(this.cycleChains);
      throw new Error(error_str);
    }
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

  private replaceTeamParents(
    acceptable_teams: Set<string>,
    teamToParent: Record<string, string>
  ): Record<string, string> {
    // Within this function we use the new acceptable teams set to
    // ensure team's parents are within the system.
    const newTeamToParent: Record<string, string> = {};
    for (const team of acceptable_teams) {
      const seenParentTeams: Set<string> = new Set<string>();
      let parent_team = teamToParent[team];
      while (parent_team && !acceptable_teams.has(parent_team)) {
        if (seenParentTeams.has(parent_team)) {
          let err_str = `Cycle found in team Parent Replace function. Team: "${parent_team}". `;
          err_str += `All teams: ${JSON.stringify([...seenParentTeams])}`;
          err_str += `Please reach out to Faros Support.`;
          throw new Error(err_str);
        }
        seenParentTeams.add(parent_team);
        parent_team = teamToParent[parent_team];
      }
      if (parent_team) {
        newTeamToParent[team] = parent_team;
      } else {
        newTeamToParent[team] = this.FAROS_TEAM_ROOT;
      }
    }
    return newTeamToParent;
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

    // Here we get a set of teams to keep
    // This is the entry point to the densest logical aspect of the connector
    const acceptable_teams: Set<string> = this.getAcceptableTeams(
      teamToParent,
      ctx
    );
    ctx.logger.info(
      'Got acceptable teams and computed team to parent team mapping.'
    );
    ctx.logger.info(
      'Acceptable teams: ' + JSON.stringify(Array.from(acceptable_teams))
    );
    ctx.logger.info('real');
    ctx.logger.info('Finished computing ownership chains.');

    const newTeamToParent: Record<string, string> = this.replaceTeamParents(
      acceptable_teams,
      teamToParent
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
    ctx.logger.info(res.length.toString());
    return res;
  }
}
