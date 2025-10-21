## Development Commands

### Core Commands
- `npm i` - Install dependencies for all projects
- `turbo build` - Build all projects
- `turbo test` - Run tests for all projects
- `turbo lint` - Run linter on all projects
- `turbo clean` - Clean all build artifacts
- `turbo build --filter=<package-name>` - Build specific package (e.g., `turbo build --filter=airbyte-faros-destination`)
- `turbo test --filter=<package-name>` - Test specific package
- `turbo lint --filter=<package-name>` - Lint specific package

### Docker Commands
- `docker build . --build-arg path=<connector-path> --build-arg version=<version> -t <tag>` - Build Docker image for connector
- Example: `docker build . --build-arg path=destinations/airbyte-faros-destination --build-arg version=0.0.1 -t airbyte-faros-destination`

### Testing Single Connector
- Navigate to specific connector directory (e.g., `sources/github-source`)
- Run `npm test` for that connector's tests
- Use `scripts/source-acceptance-test.sh` for acceptance testing

## Architecture Overview

### Repository Structure
This is a monorepo using Turborepo with the following main packages:
- `faros-airbyte-cdk` - Core CDK framework for building connectors
- `faros-airbyte-common` - Shared utilities and types
- `faros-airbyte-testing-tools` - Testing utilities
- `destinations/` - Destination connectors (e.g., airbyte-faros-destination)
- `sources/` - Source connectors (50+ connectors including GitHub, Jira, GitLab, etc.)

### Faros Airbyte CDK Architecture

#### Core Base Classes
- **`AirbyteConnector`** - Abstract base class for all connectors with `spec()` and `check()` methods
- **`AirbyteSource`** - Abstract source class extending `AirbyteConnector` with `discover()` and `read()` methods
- **`AirbyteDestination`** - Abstract destination class extending `AirbyteConnector` with `write()` method
- **`AirbyteSourceBase`** - Advanced base class with stream orchestration, incremental sync, and error handling
- **`AirbyteStreamBase`** - Base class for individual data streams with schema definition and state management

#### Key Design Patterns
- **Template Method Pattern**: Base classes define algorithm structure, concrete implementations provide specific behaviors
- **Stream Dependencies**: Sources can define dependencies between streams using topological sorting
- **Incremental Sync**: Built-in state management with cursor-based synchronization and checkpoint persistence
- **Error Resilience**: Configurable error thresholds and slice-level error handling

### Connector Development
When creating a new connector:
1. Extend `AirbyteSourceBase` or `AirbyteDestination`
2. Implement required methods: `spec()`, `checkConnection()`, `streams()`
3. Create stream classes extending `AirbyteStreamBase`
4. Define JSON schemas and implement `readRecords()` method
5. Add configuration in `resources/spec.json`
6. Create tests in `test/` directory

### Key Files
- `src/index.ts` - Main entry point for each connector
- `resources/spec.json` - Connector specification and configuration schema
- `test_files/` - Test data and configuration files
- `package.json` - Dependencies and scripts for each connector

## Project Configuration
- **Node.js**: Requires Node 22+
- **Package Manager**: npm (specified version ^10.9.2)
- **Build System**: Turborepo with TypeScript
- **Testing**: Jest with ts-jest
- **Linting**: ESLint with TypeScript rules
- **Formatting**: Prettier

## Common Patterns
- All connectors follow similar structure with `src/`, `test/`, and `resources/` directories
- TypeScript configuration in `tsconfig.json` at package level
- Test files mirror source structure in `test/` directory
- Bootstrap documentation in `bootstrap.md` for some connectors
- Acceptance test configuration in `acceptance-test-config.yml` where applicable

---

# Combined Guidelines

## Global Patterns and Guidelines

### Repository Guidelines

*   **Dependency Management**: `package-lock.json` is used for precise dependency management.
*   **Node.js Versioning**: `nvm` is the recommended tool for managing Node.js versions locally.
*   **Destination Converter Structure**: The `destinations/airbyte-faros-destination/src/converters/` directory is organized by data source (e.g., `azure-repos`), with a `common` subdirectory for shared utilities. Converters extend a `Converter` class.
*   **Shared Libraries (`faros-airbyte-common`)**:
    *   Serves as a centralized client library for common API interactions (e.g., `AzureDevOps` client) to promote code reuse.
    *   Requires `compilerOptions.experimentalDecorators: true` in its `tsconfig.json` to support decorators.
    *   Source connectors should depend on `faros-airbyte-common` for shared API clients instead of directly on external API client libraries.
*   **File Locations**:
    *   `__snapshots__` files are used within `test/converters/` for snapshot testing.
    *   `src/types.ts` is the standard location for TypeScript type definitions within connectors.
*   **Development Workflow**: After making TypeScript changes, especially in `destinations/airbyte-faros-destination`, `npm run build` must be executed in the project root before running tests to ensure compilation.

### Project Guidelines

*   **API Interaction & Error Handling**:
    *   Implement custom retry logic with exponential backoff and jitter for specific APIs (e.g., Google Drive), checking for specific API error codes.
    *   Use `VError` for detailed error handling, particularly in `checkConnection` methods, which should return `Promise<void>` and throw `VError` on failure.
    *   Implement pagination and retry logic within stream `read` or `get` methods, typically using `while (hasNextPage)` loops with `try-catch` blocks.
    *   Utilize memoization (caching) for frequently called API methods to optimize performance.
    *   For Azure DevOps Work Item Query Language (WIQL) API, handle the `19999` item limit by iteratively querying using the `System.ChangedDate` filter.
*   **Data Transformation & Modeling (Faros Destination)**:
    *   The Faros destination expects array fields (e.g., `emails`) to be empty arrays `[]` if source data is null or undefined, not arrays containing null values.
    *   Organization UIDs should be consistently lowercased across Azure DevOps data streams to ensure proper matching.
    *   Converter classes must define a `destinationModels` array explicitly listing all Faros models they produce.
    *   The core data transformation logic resides in the asynchronous `convert` method, which takes source records and a `ConverterRuntimeContext` and returns an array of `DestinationRecord` objects, specifying the `model` and `record` data.
    *   The `Utils` class provides helper functions like `toDate` for robust date conversion and `cleanAndTruncate` for data sanitization.
*   **Connector Development Practices**:
    *   Logging should use `this.logger.debug` for debug information and `this.logger.error` for error details.
    *   `spec.json` files can use an `order` property to define the display order of configuration fields.
    *   The `engines.node` field should be managed centrally in the root `package.json` and removed from individual sub-package `package.json` files.
    *   `spec.json` properties are mapped to TypeScript interfaces defined in `src/types.ts`.
    *   `luxon`'s `DateTime` is used for all date and time operations.
*   **Testing**:
    *   `mockttp` is used for API mocking in tests.
    *   `expect(records).toMatchSnapshot()` is used for snapshot testing of processed records and connection status messages.
    *   When new models or data transformations are introduced in converters, corresponding snapshot files must be updated by running `npm test -- <test_file_name> -u`.
*   **Architectural Principles**:
    *   Common client logic for specific APIs (e.g., Azure DevOps) should be centralized in `faros-airbyte-common` to promote code reuse and consistency.
    *   Maintain a clear separation of concerns: source connectors extract raw data, and destination connectors convert that raw data into a canonical Faros model, aiming to enrich existing data streams rather than creating new ones if information is available.

### Common Implementation Patterns

*   **Configuration-Driven Development**: New features or parameters are frequently exposed via `resources/spec.json`, requiring corresponding type definitions.
*   **Leveraging Shared Libraries**: Extensive use of `faros-airbyte-common` for common utilities (e.g., date range, bucketing, base API clients) to promote code reuse and consistency.
*   **Resilient API Interaction**: Implementation of robust error handling, including retry mechanisms with exponential backoff and jitter, and dynamic adjustments for API-specific behaviors (e.g., GraphQL field removal, fine-grained tokens).
*   **Standardized Incremental Sync Logic**: Consistent approach to implementing incremental syncs by defining cursor fields, managing `StreamState`, and handling API pagination.
*   **Dedicated Data Transformation Layer**: Centralization of data mapping and transformation logic within destination converters.
*   **Comprehensive Testing Strategy**: Reliance on updating mock data and extensive use of snapshot tests to validate data structures, error messages, and record generation.
*   **UID Standardization**: A consistent practice of generating canonical and often lowercased UIDs for entities to ensure consistency across different sources and related models.

### Technical Requirements

*   **Configuration & Type Synchronization**: Any new configurable parameter must be added to `resources/spec.json` and reflected in `src/types.ts` or relevant TypeScript interfaces.
*   **API Resilience Implementation**: Must include retry mechanisms with exponential backoff and jitter for transient API errors (e.g., rate limits, temporary unavailability).
*   **Dynamic API Query Handling**: Ability to dynamically adjust API queries, such as removing unavailable GraphQL fields, to maintain compatibility.
*   **Incremental Sync Management**: Requires defining specific cursor fields, managing `StreamState` per stream slice, and filtering API calls based on `since` timestamps.
*   **API Pagination Handling**: Logic must correctly handle API pagination limits within incremental queries to ensure all data is retrieved.
*   **Destination Data Transformation**: Converters must accurately map source fields to Faros models, gracefully handle null/undefined values, and generate consistent UIDs.
*   **Multi-Record Generation**: Converters should be capable of generating multiple Faros records from a single source record when necessary.
*   **Canonical UID Generation**: UIDs for entities must be generated consistently, often lowercased, and standardized across related models (e.g., `cicd_Organization` and `vcs_Organization`).
*   **Test Asset Maintenance**: Requires updating test files, mock data (e.g., `all-streams.log`, `incidents.json`), and especially snapshot tests (`__snapshots__/*.snap`) to validate changes.

### Implementation Guidelines

*   **Prioritize Shared Utilities**: Always check `faros-airbyte-common` for existing functionalities (e.g., date range calculation, bucketing, base API clients) before implementing custom logic to ensure consistency and reduce duplication.
*   **Design for API Robustness**: Implement API clients with built-in retry logic, error handling for specific API quirks (e.g., fine-grained tokens), and mechanisms for dynamic query adjustments to handle schema changes or rate limits gracefully.
*   **Structured Incremental Sync**: When implementing incremental sync, clearly define cursor fields, ensure `StreamState` is managed effectively (ideally per stream slice), and integrate pagination handling directly into the API fetching logic.
*   **Converter-First Data Transformation**: Develop destination converters as the primary mechanism for data transformation, focusing on accurate mapping, robust null/undefined handling, and the generation of canonical UIDs. Consider scenarios where a single source record might yield multiple Faros records.
*   **Test-Driven Development with Snapshots**: Integrate comprehensive testing from the outset. Leverage mock data and prioritize snapshot tests to quickly validate changes in data structures, error messages, and the final Faros records generated by converters.
*   **Enforce UID Consistency**: Establish and strictly follow conventions for UID generation (e.g., lowercasing, specific concatenation rules) to ensure cross-source and cross-model consistency for entities.
*   **Maintain Configuration-Code Sync**: Ensure that any changes to `resources/spec.json` are immediately reflected in the corresponding TypeScript types (`src/types.ts` or relevant files) to maintain type safety and configuration integrity.

