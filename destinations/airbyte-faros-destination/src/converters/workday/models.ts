export declare type EmployeeRecord = {
  Start_Date: Date;
  Full_Name: string;
  Employee_ID: string;
  Manager_Name: string;
  Manager_ID: string;
  Team_Name: string;
  Termination_Date?: Date;
};

export declare type ManagerTimeRecord = {
  Manager_ID: string;
  Timestamp: Date;
};
