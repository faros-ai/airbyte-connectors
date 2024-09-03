## Notes
Note that blocked orgs is stronger than used orgs.
That means, if an org is under a used org, but is also under a blocked org,
then we do not keep that org.
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
