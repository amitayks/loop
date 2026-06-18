## ADDED Requirements

### Requirement: Window proxy generation failures are observable
When proxy generation fails for a window-capture file (for example, an input FFmpeg cannot parse), the failure SHALL be observable to the renderer rather than silently swallowed: `generateProxy` rejects, the main IPC handler emits a `proxy:progress` event with `status: 'error'`, and the renderer SHALL record the take's proxy status as failed (`error`) in the `proxyStatus` map and re-render the section markers, so a missing window proxy is detectable by the editor and by tests.

> Note: this requirement is satisfied by the pre-existing `status: 'error'` proxy-progress path. An earlier attempt to add a parallel `status: 'failed'` callback mechanism was found to be redundant (never wired through `register-handlers`) and was reverted.

#### Scenario: Window proxy input is unreadable
- **WHEN** proxy generation is queued for a window capture file that FFmpeg cannot parse (e.g. a 0-byte/`EBML`-failing file)
- **THEN** `generateProxy` rejects and the main process emits `proxy:progress` with `status: 'error'`
- **AND** the renderer sets that take's `proxyStatus` entry to `{ status: 'error' }` and re-renders section markers
- **AND** the failure is surfaced (logged + observable status), not silently swallowed

#### Scenario: Valid window proxy input succeeds
- **WHEN** proxy generation is queued for a valid window capture webm
- **THEN** the proxy is generated with the same encoding settings as screen proxies (H264, 960x540, CRF 23, preset fast, `-g 15`, AAC 64kbps, `-movflags +faststart`)
- **AND** the take/overlay `proxyPath` is updated and persisted
