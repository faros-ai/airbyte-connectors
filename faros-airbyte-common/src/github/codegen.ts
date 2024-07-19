import type {CodegenConfig} from '@graphql-codegen/cli';
import path from 'path';

const SCALARS = {
  Base64String: 'string',
  BigInt: 'string',
  Date: 'string',
  DateTime: 'string',
  GitObjectID: 'string',
  GitRefname: 'string',
  GitSSHRemote: 'string',
  GitTimestamp: 'string',
  HTML: 'string',
  PreciseDateTime: 'string',
  URI: 'string',
  X509Certificate: 'string',
};

const config: CodegenConfig = {
  overwrite: true,
  schema: 'resources/github/schemas/schema.docs.graphql',
  documents: ['resources/github/queries/*.gql'],
  generates: {
    [path.join(__dirname, 'generated', 'index.ts')]: {
      plugins: ['typescript', 'typescript-operations'],
      config: {
        onlyOperationTypes: true,
        scalars: SCALARS,
        skipTypename: true,
        strictScalars: true,
      },
    },
  },
  hooks: {afterAllFileWrite: ['prettier --write']},
};

export default config;
