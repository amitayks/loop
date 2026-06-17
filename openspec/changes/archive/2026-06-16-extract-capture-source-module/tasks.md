## 1. Create the capture module

- [x] 1.1 Confirm the cluster's current line range in `app.ts` (the 12 functions: updatePickerButtonText, renderPickerPanel, createPickerRadioRow, createPickerCheckboxRow, applyPickerSelection, populatePickerSources, enumerateDevices, updateScreenStream, updateCameraStream, updateAudioStream, updateWindowStreams, cleanupWindowStreams). Do NOT include pickAndLoadBackground/loadBackgroundFromPath.
- [x] 1.2 Create `src/renderer/features/capture/source-picker.ts`: move the 12 functions verbatim (bodies unchanged). Export each one that `app.ts` calls. Add imports: state bindings + setters from `../../state.js`; DOM elements from `../dom/elements.js`; any types/helpers from `../../shared/...` or sibling feature modules. Leave `window.electronAPI` / `navigator.mediaDevices` as ambient globals.

## 2. Rewire app.ts

- [x] 2.1 Delete the 12 moved function definitions from `app.ts`. Add a named `import { … } from './features/capture/source-picker.js';` for the entry points `app.ts` still references. Keep all call sites unchanged.
- [x] 2.2 Reconcile (typecheck-guided): run `npm run typecheck` — add to the module any state binding/setter/element/type/sibling-function it references but didn't import; add to `app.ts` any moved function it calls but didn't import; if a moved function references a non-cluster helper still in `app.ts`, prefer moving that helper too or export it minimally. Iterate until typecheck is clean. Then `npm run lint --max-warnings=0` — prune unused imports in both files.

## 3. Verification & docs

- [x] 3.1 `npm run build` — completes; bundle rebuilt.
- [x] 3.2 `npm run typecheck` + `npm run lint` (`--max-warnings=0`) — green.
- [x] 3.3 `npm run test:e2e` — renderer-health smoke PASSES (`[renderer-loaded]`, no error markers). Run twice.
- [x] 3.4 Full `npm run check` — green end to end.
- [x] 3.5 Update `docs/production/target-architecture.md`: add `features/capture/source-picker.js` to the module layout.

## 4. Hand-off

- [x] 4.1 Summarize: functions moved; what stayed (background-image); imports added; commands run; gate green; next domain to extract.
