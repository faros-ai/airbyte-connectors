export class Query {
  static work(
    limit: number,
    offset: number,
    lastModifiedDate?: string
  ): string {
    let res = `
      SELECT
        Id,
        Name,
        agf__Description__c,
        agf__Type__c,
        agf__Priority__c,
        agf__Status__c,
        agf__Story_Points__c,
        CreatedDate,
        LastModifiedDate,
        agf__Parent_ID__c,
        
        CreatedById, 
        agf__Epic__c,
        agf__Sprint__c,


        CreatedBy.Id,
        CreatedBy.Email,
        CreatedBy.Name,
        CreatedBy.Username, 


        agf__Epic__r.Id,
        agf__Epic__r.Name,
        agf__Epic__r.agf__Description__c,
        agf__Epic__r.agf__Health__c,


        agf__Epic__r.agf__Project__r.Id,
        agf__Epic__r.agf__Project__r.Name,
        agf__Epic__r.agf__Project__r.agf__Project_Management_Notes__c,
        agf__Epic__r.agf__Project__r.agf__Project_Summary__c,
        agf__Epic__r.agf__Project__r.CreatedDate,
        agf__Epic__r.agf__Project__r.LastModifiedDate,


        agf__Sprint__r.Id,
        agf__Sprint__r.Name,
        agf__Sprint__r.CreatedDate,
        agf__Sprint__r.LastModifiedDate,
        agf__Sprint__r.agf__Retrospective__c,

        agf__Sprint__r.agf__Committed_Points__c,
        agf__Sprint__r.agf__Committed_Story_Points_Completed__c,
        agf__Sprint__r.agf__Completed_Story_Points__c,
        agf__Sprint__r.agf__Completion_Committed_Story_Points__c,
        agf__Sprint__r.agf__Completion_Story_Points__c,

        agf__Sprint__r.agf__Days_Remaining__c,
        agf__Sprint__r.agf__Start_Date__c,
        agf__Sprint__r.agf__End_Date__c


      FROM agf__ADM_Work__c
    `;

    if (lastModifiedDate) {
      res += ` WHERE LastModifiedDate > ${lastModifiedDate}`;
    }
    res += ` LIMIT ${limit} OFFSET ${offset}`;

    return res;
  }
}
