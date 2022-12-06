import avro from 'avsc';

const nodeIdType = avro.Type.forSchema({
  name: 'NodeId',
  type: 'record',
  fields: [
    {name: 'model', type: 'string'},
    {name: 'key', type: 'bytes'},
  ],
});

export class Nodes {
  private registry: {[name: string]: avro.Type};

  constructor(entrySchema: avro.Schema) {
    const registry = {};
    avro.Type.forSchema(entrySchema, {registry});
    this.registry = registry;
  }

  decodeId(id: string): any {
    const buf = Buffer.from(id, 'base64');
    const {model, key} = nodeIdType.fromBuffer(buf);
    const keyType = this.registry[`${model}__Key`];
    return keyType.fromBuffer(key);
  }
}
