# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.2] - 2024-08-28

### Added
- Added support for custom HTTP query parameters via `reportParams` configuration option
- Users can now supply an arbitrary list of HTTP query parameters when invoking custom reports
- New `ReportParam` interface for type safety
- Comprehensive unit tests for parameter merging functionality
- Documentation for the new feature in README.md

### Changed
- Enhanced `customReports()` method to accept optional `reportParams` parameter
- Updated `WorkdayConfig` interface to include optional `reportParams` field
- Modified JSON schema specification to include `reportParams` array property

### Technical Details
- Implements last-wins strategy for duplicate parameter names
- Maintains backward compatibility (omitting `reportParams` yields identical behavior)
- The `format` parameter in API requests defaults to the value of `reportFormat` but can be overridden by user-supplied parameters
- Added JSDoc documentation for new configuration fields

## [0.0.1] - 2024-08-28

### Added
- Initial implementation of Workday source connector
- Support for Workers, People, Organizations, and Custom Reports streams
- Basic authentication and OAuth2 token support
- CSV and JSON report format support
- Connection checking and pagination functionality