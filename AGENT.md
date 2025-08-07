# AGENT.md

This file provides guidance to agents when working with code in this repository.

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

*   **Jest Testing**: Prefers `toHaveBeenCalledTimes` over `toBeCalledTimes` for mock assertions.
*   **Dependency Management**: Uses `package-lock.json` for precise dependency versions. The root `package.json` specifies the `packageManager`. Updates to `package.json` files require regenerating `package-lock.json` by running `npm install` or `npm update`.
*   **Destination Connector Structure**: Destination connectors, particularly `airbyte-faros-destination`, utilize a `src/converters/<source_name>/` directory structure to house data transformation logic for specific sources.
*   **Testing Artifacts**: Test snapshots are stored in `test/converters/__snapshots__/` directories. Specific test resources and logs can be found in `test/resources/`.
*   **Shared Libraries & Utilities**:
    *   `faros-airbyte-common` centralizes common client logic (e.g., Azure DevOps API interactions) and shared utilities like `calculateDateRange` and `StreamState`.
    *   Specific libraries for API interactions include `octokit` and `graphql` for GitHub, and `azure-devops-node-api` for Azure DevOps.
    *   Other common utilities include `faros-js-client` for `Utils.toDate`, `luxon` for date/time handling, `typescript-memoize` for memoization, and `ts-essentials` for utility types.
*   **Source Connector Structure**: Source connectors often include a `src/types.ts` file for specific type definitions, and individual stream implementations may be organized within a `streams/` subdirectory.

### Project Guidelines

*   **Error Handling**:
    *   `VError` is used for wrapping and re-throwing errors to provide more specific and user-friendly messages, always wrapping the original error.
    *   The `checkConnection` method should return `[true, undefined]` for success or `[false, VError]` for failure.
*   **Logging**:
    *   `this.logger.debug` and `this.logger.error` statements are used for logging.
    *   When logging objects, use the `%j` format specifier (e.g., `this.logger.debug('Message: %j', object);`).
    *   When logging stringified objects, use the `%s` format specifier (e.g., `this.logger.error('Message: %s', JSON.stringify(object));`).
*   **Testing Practices**:
    *   Snapshot testing is extensively used for `AirbyteConnectionStatusMessage` outputs and destination write tests. For destination write tests, `checkRecordsData: (records) => expect(records).toMatchSnapshot()` should be added to the `destinationWriteTest` call.
    *   Temporary configurations for tests should use `tempConfig` with source-specific configurations nested under `source_specific_configs`.
*   **API Interaction & Data Processing**:
    *   Source-specific retry logic for API errors (e.g., rate limits) should be implemented, utilizing `faros-js-client`'s `Utils.sleep` for delays and `lodash.random` for jitter in backoff strategies.
    *   `axios` is commonly used for making HTTP requests.
    *   Sources are responsible for complex data resolution and enrichment (e.g., mapping commit authors to unique user identifiers) to ensure data completeness.
    *   Dedicated collector classes (e.g., `UserCollector`) are introduced in sources for managing deduplication, merging partial data, and mapping across different data streams.
    *   Destination connectors primarily focus on mapping already enriched and resolved data from the source into Faros models, avoiding re-implementation of complex data collection or resolution logic.
    *   Data standardization, such as converting organization UIDs to lowercase, is implemented via common helper methods.
*   **Configuration & Sync**:
    *   The `cutoff_days` configuration determines the default date range for full refreshes and the starting point for incremental syncs when no state is present.
    *   The `calculateDateRange` utility is used to determine appropriate start and end dates for incremental data fetching.
    *   Incremental synchronization often employs a slicing mechanism where `streamSlices` define the units of work for `readRecords`.
*   **Connector Development**:
    *   When adding new data streams that need to be mapped to Faros destination models, a dedicated converter class is required. This class should extend the common converter for that source (e.g., `GitlabConverter`), specify the `destinationModels` property, and implement the `convert` method for data transformation.
    *   The `OrgRepoFilter` class is used in source connectors to determine which organizations and repositories should be synced based on configuration.

### Common Implementation Patterns

*   **Source-centric Data Processing:** A consistent preference for performing data enrichment and transformation as close to the source as possible, within the connector itself.
*   **Code Reusability & Modularity:** Extracting common logic, especially API client interactions and utility functions, into shared libraries to promote reuse and reduce duplication.
*   **User Configurability:** Exposing key operational parameters to users via `spec.json` to allow fine-tuning of connector behavior.
*   **Resilient API Interaction:** Implementing sophisticated error handling, retry mechanisms (with backoff and jitter), and dynamic adjustments to gracefully handle API limitations and failures.
*   **Standardized Observability:** Consistent logging practices for monitoring sync progress, debugging, and error reporting.
*   **Rigorous Data Modeling & Quality:** Attention to detail in data model updates, including immutability and null handling.
*   **Comprehensive Testing Strategy:** Extensive use of mocking, detailed assertions, and snapshot testing to ensure data integrity and transformation correctness.
*   **Advanced Sync Capabilities:** Designing for incremental syncs through sophisticated stream slicing and state management.
*   **Utility-Driven Standardization:** Creating common functions for parsing and standardizing data elements like URLs and identifiers.
*   **Proactive Connection Validation:** Implementing dedicated, efficient connection checks to provide immediate feedback to users.

### Technical Requirements

*   Data enrichment (e.g., resolving commit authors, adding `author_username`) *must* occur within the source connector.
*   Common API client logic (e.g., Azure DevOps client, retry mechanisms) *must* be extracted into `faros-airbyte-common`.
*   `spec.json` *must* expose `max_retries`, `retry_delay`, `page_size`, and `cutoff_days`.
*   Error handling *must* include `try-catch` blocks, specific error message checks, exponential backoff, jitter, and dynamic adjustments (e.g., reducing page size, modifying GraphQL queries).
*   Logging *must* consistently use `this.logger.info`, `debug`, and `error`.
*   New fields *must* use `readonly` keywords, and `null` values *must* be handled gracefully (e.g., `[null]` vs `[]`).
*   Tests *must* extensively use mocks for external API calls, include detailed assertions for data transformations, and maintain meticulous snapshot updates.
*   Connectors *must* implement advanced stream slicing (e.g., project-level, branch-level) and complex, nested state objects for incremental sync.
*   Common utility functions *must* be created for parsing complex URLs (e.g., Azure DevOps Cloud vs. Server) and standardizing identifiers (e.g., lowercase UIDs).
*   Dedicated `checkConnection` methods *must* perform lightweight API calls and provide clear, actionable error messages.

### Implementation Guidelines

*   **Enrich Data at Source:** Always prioritize enriching data within the source connector to simplify downstream processing and reduce the burden on destination converters.
*   **Promote Code Sharing:** Before implementing new API client logic or common utilities, check `faros-airbyte-common` for existing solutions or contribute new generic components there.
*   **Design for User Control:** When defining connector specifications, identify and expose key operational parameters (like retry settings, page size, and data cutoff) in `spec.json` to empower users.
*   **Build Resilient API Clients:** Implement comprehensive error handling for all API interactions, incorporating exponential backoff with jitter for retries, and logic to dynamically adjust requests (e.g., reducing page size) in response to API errors or rate limits.
*   **Adopt Consistent Logging:** Utilize the provided logger (`this.logger`) consistently for all informational, debug, and error messages to ensure clear observability of sync operations and facilitate debugging.
*   **Maintain Data Model Integrity:** When extending data models, ensure new fields are marked `readonly` where appropriate and handle `null` values explicitly to prevent unexpected behavior (e.g., distinguishing between an empty list `[]` and a list containing `null` `[null]`).
*   **Prioritize Test Coverage:** Write thorough tests that mock all external API calls, assert specific data transformations, and use snapshot testing to validate the overall output structure and content. Update snapshots meticulously.
*   **Implement Advanced Sync Strategies:** For incremental syncs, design sophisticated stream slicing mechanisms (e.g., based on projects, branches, or other logical units) and manage state using complex, nested objects to ensure efficient and accurate data loading.
*   **Develop Shared Utilities:** Create and leverage common utility functions for tasks like URL parsing, ID standardization, and other repetitive data transformations to ensure consistency and reduce boilerplate code.
*   **Provide Clear Connection Feedback:** Implement a dedicated `checkConnection` method that performs a minimal, efficient API call to verify credentials and connectivity, providing specific and actionable error messages to the user.

