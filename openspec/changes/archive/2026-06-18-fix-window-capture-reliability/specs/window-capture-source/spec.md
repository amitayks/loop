## ADDED Requirements

### Requirement: Picker surfaces missing Screen Recording permission
When macOS Screen Recording permission is not granted, the source picker SHALL display an actionable message explaining that permission is required and where to grant it, instead of an empty source list. The renderer SHALL determine permission state via the main process (`systemPreferences.getMediaAccessStatus('screen')`, exposed as the `getScreenAccessStatus` IPC); an absence of any `screen:`/`window:` source is treated as a corroborating signal. When permission is granted, no such message is shown and sources list normally.

#### Scenario: Permission not granted
- **WHEN** the recording view's source picker is opened and `getScreenAccessStatus()` is not `granted` (and/or `getSources()` returns no screen/window sources)
- **THEN** the picker shows a message directing the user to enable Screen Recording for their terminal (or the packaged app) in System Settings → Privacy & Security → Screen Recording, then fully quit and reopen
- **AND** it does not present a silently-empty list

#### Scenario: Permission granted
- **WHEN** Screen Recording permission is granted
- **THEN** the picker lists the available screen and window sources with no permission message
