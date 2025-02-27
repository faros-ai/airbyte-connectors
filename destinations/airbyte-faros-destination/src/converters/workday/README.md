## Notes
We keep the orgs where the most recent parent is kept.
If you leave both orgs_to_keep and orgs_to_ignore empty, then this
syncs the entire org.
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
```

Source Specific Configs:
```
orgs_to_keep: string[];
orgs_to_ignore: string[]
fail_on_cycles: bool (default is false)

```

Note: 
Employees might appear on more-than-one records if they belong to more-than-one teams.
