export interface User {
  id: number;
  employeeId: number;
  email: string;
  firstName: string;
  lastName: string;
  status: string;
  lastLogin?: string;
}
