

export interface WorkItemResponse {
    count: number;
    value: WorkItem[];
  }

export interface WorkItem{
  fields: fields
  id: string
  rev:  string
  url: string   
}


export interface System {
  AreaPath: string
  AssignedTo: user
  BoardColumn: string
  ChangedBy: user
  CreatedDate: string

  IterationLevel3: string
  IterationPath: string
  PersonId: string
  Reason: string
  Rev: string
  RevisedDate: string
  State: string
  TeamProject: string
  Title: string
  Watermark: string
  WorkItemType: string
  parent: string | null
//  childOf: string | null
}

export interface user{
  displayName: string
  url: string
  _links: string
  id: string
  uniqueName: string

}

export interface fields{

  Microsoft: {
    VSTS: {
      Common: {
        Priority: string
        StateChangeDate: string
        ValueArea: string
      }
    },   
  }
  System: System
}