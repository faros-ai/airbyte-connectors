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
  Termination_Date?: Date;
  Location?: string;
  Email?: string;
```

Source Specific Configs:
```
Orgs_To_Keep: string[];
Orgs_To_Ignore: string[]
```

## Testing:
In order to test, use the files in test/resources/workday.
Specifically: generate_records.txt. Move it to generate_records.js
Then uncomment everything. You can modify it to generate a JSON of records.
```node generate_records.js```
Once that JSON is generated, you can use 'flatten_json.js' to turn that JSON
file of records into streams:
```node flatten_json.js input_file.json output.log```
