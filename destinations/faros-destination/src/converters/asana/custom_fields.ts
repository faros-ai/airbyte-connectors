// import {AirbyteRecord} from 'faros-airbyte-cdk';

// import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
// import {AsanaConverter} from './common';

// export class AsanaCustomFields extends AsanaConverter {
//   readonly destinationModels: ReadonlyArray<DestinationModel> = ['tms_TaskField'];

//   convert(
//     record: AirbyteRecord,
//     ctx: StreamContext
//   ): ReadonlyArray<DestinationRecord> {
//     const source = this.streamName.source;
//     const customField = record.record.data;
    
//     const tmsCustomFields: DestinationRecord = {
//       model: 'tms_TaskField',
//       record: {
//         name: customField.name,
//         value: ''
//       }
//     }

//     return [tmsCustomFields];
//   }
// }
