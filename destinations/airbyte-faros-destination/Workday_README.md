## Notes
Expecting fields (? implies optional):
```
  Start_Date: Date;
  Full_Name: string;
  Employee_ID: string;
  Manager_Name: string;
  Manager_ID: string;
  Team_Name: string;
  Termination_Date?: Date;
  Location?: string;
  Email?: string;
```

Source Specific Configs:
```
orgs_to_keep: string[];
orgs_to_ignore: string[]
```
