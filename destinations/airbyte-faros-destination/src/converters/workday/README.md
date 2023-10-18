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
  Termination_Date?: Date;
  Location?: string;
  Email?: string;
```

Source Specific Configs:
```
Orgs_To_Keep
Orgs_To_Ignore
```