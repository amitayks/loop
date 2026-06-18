## ADDED Requirements

### Requirement: E2E coverage exercises the record-to-timeline interaction flow
The renderer-health coverage SHALL include an interaction-level check that goes beyond the idle-boot smoke. A test SHALL drive the app through the real flow — open a project, enter the recording view, select a window source, start recording, stop recording — and SHALL assert that (a) a take is created with `windowPaths`, and (b) the captured window content is non-black (a sampled frame is not entirely black). The test MAY drive the renderer over the Chrome DevTools Protocol (using the bundled `ws` dependency, the approach proven for this flow) and SHALL skip cleanly with an explicit "skipped: no capture" signal when desktop capture or screen-recording permission is unavailable, so it never red-fails on incapable CI runners.

#### Scenario: Window capture produces a non-black take
- **WHEN** the interaction test selects a window, records briefly, and stops on a capture-capable machine
- **THEN** a take with `windowPaths` is created and appears in the timeline
- **AND** a sampled frame of the window capture is non-black
- **AND** the test passes

#### Scenario: Black or missing window capture fails the check
- **WHEN** the interaction test records a window but the capture is entirely black, or no take is created
- **THEN** the test fails, identifying the black-frame / missing-take regression

#### Scenario: Capture unavailable on the runner
- **WHEN** the interaction test runs where desktop capture or screen-recording permission is unavailable
- **THEN** the test self-skips with an explicit "skipped: no capture" signal rather than failing
