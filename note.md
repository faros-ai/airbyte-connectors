

## AirbyteStateMessage Schema

```json
{
  "type": "STATE",
  "state": {
    // AirbyteStateMessage
    "type": "GLOBAL" | "STREAM" | "LEGACY",  // AirbyteStateType - if not set, assume LEGACY
    "stream": {                               // AirbyteStreamState - used when type=STREAM
      "stream_descriptor": {                  // StreamDescriptor (required)
        "name": "string",                     // (required)
        "namespace": "string"
      },
      "stream_state": {}                      // AirbyteStateBlob - any JSON object
    },
    "global": {                               // AirbyteGlobalState - used when type=GLOBAL
      "shared_state": {},                     // AirbyteStateBlob - any JSON object
      "stream_states": [                      // (required) array of AirbyteStreamState
        {
          "stream_descriptor": {              // StreamDescriptor (required)
            "name": "string",                 // (required)
            "namespace": "string"
          },
          "stream_state": {}                  // AirbyteStateBlob - any JSON object
        }
      ]
    },
    "data": {},                               // (deprecated) used when type=LEGACY - any JSON object
    "sourceStats": {                          // AirbyteStateStats
      "recordCount": 0.0,                     // number of records emitted
      "rejectedRecordCount": 0.0,             // number of records rejected
      "additionalStats": {                    // additional stats as key-value pairs
        "key": 0.0
      }
    },
    "destinationStats": {                     // AirbyteStateStats (same structure as sourceStats)
      "recordCount": 0.0,
      "rejectedRecordCount": 0.0,
      "additionalStats": {}
    }
  }
}
```

How to store compressed json in the new Global format
1. `state.global.shared_state`
2. `state.global.stream_states[0].stream_state`. we will have to have some name for it since `stream_descriptor.name` is required

--

In Airbyte state message
Legacy
```json
// non-compressed
{
  "type":"STATE",
  "state":{
    "data":{
      "stream1": {"cursor": "..."}, 
      "stream2": {...}
    }
  }
}

// compressed
{
  "type":"STATE",
  "state":{
    "data":{
      "format": "base64/gzip",
      "data": "H4sI..."
    }
  }
}
```

Global
```json
// non-compressed
{
  "type":"STATE",
  "state": {
    "type": "GLOBAL",
    "global": {
      "shared_state": {},
      "stream_states": [
        {"stream_descriptor": {"name": "__bucket_execution_state"}, "stream_state": {"last_executed_bucket_id": 2}},
        {"stream_descriptor": {"name": "users"}, "stream_state": {"cursor": "2024-01-01"}},
        {"stream_descriptor": {"name": "repos"}, "stream_state": {"cursor": "2024-01-02"}}
      ]
    }
  }
}

// compressed
{
  "type":"STATE",
  "state":{
    "type": "GLOBAL",
    "global": {
      "shared_state": {
        "format":"base64/gzip",
        "data":"H4sIAAAA..."
      },
      "stream_states": []
    }
  }
}
```

--

In state file:
Legacy:
```json
// non-compressed
{
  "stream1": {"cursor": "..."}, 
  "stream2": {...}
}

// compressed
{
  "format":"base64/gzip",
  "data":"..."
}
```

Global:
```json
// non-compressed
[{
  "type": "GLOBAL",
  "global": {
    "shared_state": {},
    "stream_states": [
      {"stream_descriptor": {"name": "__bucket_execution_state"}, "stream_state": {"last_executed_bucket_id": 2}},
      {"stream_descriptor": {"name": "users"}, "stream_state": {"cursor": "2024-01-01"}},
      {"stream_descriptor": {"name": "repos"}, "stream_state": {"cursor": "2024-01-02"}}
    ]
  }
}]


// compressed
[{
  "type": "GLOBAL", 
  "global": {
    "shared_state": {
      "format":"base64/gzip",
      "data":"H4sIAAAA..."
    },
    "stream_states": []
  }
}]
```

--

In CLI

- Read from state file: directly feed the json to faros-airbyte-cdk
- Write to state file: 
  - Legacy: grab Airbyte State messsage `.state.data`
  - Global: grab Airbyte State messsage `[.state]` (wrap with an array)

--

In faros-airbyte-cdk

1. State input can be possible 4 format
    * Legacy non-compressed
    * Legacy compressed
    * Global non-compressed: convert to legacy format.
        * `stream_states.stream_descriptor.name` as stream name
        * `stream_states.stream_state` as the stream state
    * Global compressed: decompress `.state.global.shared_state`. doesnt need to convert since we compress it from legacy format
1. Internal we stay using the Legacy format to do logic
1. Write out AirbyteStateMessage
    - Always write in Global format
    - Non compressed one: write it as it is
    - Compressed one: compressed the Legacy format and put the json in `.state.global.shared_state`

--



