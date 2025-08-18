# Faros Event Converters

This directory contains converters for processing Faros Event data into the Faros data model. The converters transform CI & CD events into Faros models.

## Overview

The Faros Event converters support two primary event types: CI & CD. Invalid events are logged with detailed error messages and skipped during processing. The converters are designed to be resilient and continue processing valid events even when encountering malformed data.

### CI Events Converter (`ci-events.ts`)

The `CIEventsConverter` processes Faros CI events, focusing on build execution and artifact creation.

**Schema**: CI events must contain at least one of the following properties:
- `artifact` - Build artifact information (optional)
- `commit` - Version control commit information (optional) 
- `run` - Build/pipeline run information (optional)

For detailed schema definitions and validation rules, see:
- [CI Event Schema](./types/ci.ts) - `CIEvent` interface and `ciValidationSchema`
- [Common Types](./types/common.ts) - Shared interfaces (`Artifact`, `Commit`, `Run`, `RunStep`, `Agent`, etc.)

**Parameters**:
- `skipSavingRun`: Skip saving the run/build record itself
- `noArtifact`: Skip artifact creation entirely

### CD Events Converter (`cd-events.ts`)

The `CDEventsConverter` processes Faros CD events, focusing on application deployments and their lifecycle.

**Schema**: CD events must contain at least one of the following properties:
- `deploy` - Deployment information (optional)
- `artifact` - Build artifact information (optional)
- `commit` - Version control commit information (optional)
- `run` - Build/pipeline run information (optional)

For detailed schema definitions and validation rules, see:
- [CD Event Schema](./types/cd.ts) - `CDEvent` and `Deploy` interfaces with `cdValidationSchema`
- [Common Types](./types/common.ts) - Shared interfaces (`Artifact`, `Commit`, `Run`, `RunStep`, `Agent`, etc.)

**Parameters**:
- `skipSavingRun`: Skip saving the run/build record itself
- `noDeployUidPrefix`: Skip prefixing deployment UID with application and environment
