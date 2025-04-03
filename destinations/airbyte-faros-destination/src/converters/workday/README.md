## Notes
We keep the orgs where the closest parent is kept.
If you leave both orgs_to_keep and orgs_to_ignore empty, then the destination
syncs the entire org.
By default, we don't sync employees that are no longer active (i.e. terminated employees).
In order to sync them, set the flag keep_terminated_employees to true.
To avoid using managers to create org, you can set Parent_Team_ID on every record.

Expecting fields (? implies optional):
```
  Start_Date: Date;
  Full_Name: string;
  Employee_ID: string;
  Manager_Name: string;
  Manager_ID: string;
  Team_Name: string;
  Team_ID: string;
  Termination_Date?: Date;
  Location?: string;
  Email?: string;
  Employee_Type?: string;
  Job_Title?: string;
  Parent_Team_ID?: string
```

Source Specific Configs:
```
orgs_to_keep: string[];
orgs_to_ignore: string[]
ignore_cycle_teams
fail_on_cycles: bool (default is false)
keep_terminated_employees: bool (default is false)
resolve_locations: bool (default is false)
use_parent_team_id: bool (default is false)

```
For more details on source specific configs, look at 
destinations/airbyte-faros-destination/resources/source-specific-configs/workday.json

Note: 
Employees might appear on >1 records if they belong to >1 teams.
