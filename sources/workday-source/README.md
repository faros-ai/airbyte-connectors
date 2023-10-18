
## Custom Reports:
When providing a Custom Report, please use the "Worker Data" setting. 
Export the report to a JSON file which will be a list of employee records,
all of which have similar fields. Among those specific field names,
in order to use the destination, we require the field names to contain the following:
```
Start_Date: date
Full_Name: str
Employee_ID: str
Manager_Name: str
Manager_ID: str
Team_Name: str
```
Below is an optional field:
```
[Termination_Date]: str
```
For the Custom Report, the expected credentials are a username and password.