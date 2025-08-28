# Workday Source

This is the repository for the Workday source connector, written in Typescript.

For common build, test, and run instructions, see the [common source documentation](../README.md#common-development-instructions).

## Custom Reports

When providing a Custom Report, please use the "Worker Data" setting. 
Export the report to a JSON file which will be a list of employee records,
all of which have similar fields. Among those specific field names,
in order to use the destination, we require the field names to contain the following:
(? implies optional):
```
  Start_Date: Date;
  Full_Name: string;
  Employee_ID: string;
  Manager_Name: string;
  Manager_ID: string;
  Team_ID: string;
  Team_Name: string;
  Termination_Date?: Date;
  Location?: string;
  Email?: string;
  Employee_Type?: string;
```
For the Custom Report, the conventional credentials are a username and password.
You can optionally include OAuth using a clientId, a clientSecret, and a refreshToken.

## Custom Report Parameters

You can provide additional HTTP query parameters when invoking custom reports using the `reportParams` configuration option:

```json
{
  "tenant": "acme",
  "baseUrl": "https://wd2-impl-services1.workday.com", 
  "customReportName": "My_Custom_Report",
  "reportFormat": "json",
  "credentials": {
    "credential_type": "userpassword",
    "username": "your-username",
    "password": "your-password"
  },
  "reportParams": [
    {
      "name": "startDate",
      "value": "2023-01-01"
    },
    {
      "name": "endDate", 
      "value": "2023-12-31"
    }
  ]
}
```

These parameters will be added to the API request URL alongside the hardcoded `format=json` parameter. If you provide a parameter with the same name as an existing parameter, your value will take precedence (last-wins behavior).