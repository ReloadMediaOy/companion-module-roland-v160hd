# Feature support and current limits

This document describes community test build **2.5.1-beta.1**, whose runtime JavaScript is unchanged from the original 2.5.0 implementation at [`757da28`](https://github.com/roopeberg/companion-module-roland-v160hd/tree/757da284994835383262349c7efd998ed89cac91). These features were not all added by the beta packaging release. Later work prepared for the official Bitfocus module is a separate implementation.

**Implemented** means that a named action, feedback, variable or preset exists in this build. **Partial** means that only part of the device function is exposed, or a specific implementation limitation applies. **No dedicated controls** means that this module has no purpose-built controls for that function; a generic panel-button action or an existing device macro may still reach part of it indirectly.

These are implementation descriptions, not hardware-test results. See [TESTING.md](TESTING.md) for recorded evidence and checks still requiring a real switcher. The two documented protocol discrepancies below are known implementation findings, separate from missing test coverage.

The bundled [Reference Manual](manuals/V-160HD_Reference_eng09_W.pdf) covers firmware **3.50 and later**. The older firmware 1.04 minimum carried in the module documentation does not establish that every feature below is available or tested on every firmware version. Include your actual firmware version in test reports.

## Implemented and partial support

| Function | Status | What this build exposes and where the boundary is |
|---|---|---|
| PGM/PVW and AUX 1–3 sources | Implemented | Source selection, per-bus tally feedback and source presets, including multi-tally buttons. Button indication can include optimistic local state; it is not independent proof that a command reached the switcher. |
| INPUT/XPT 1–20 | Implemented | Assignment, source selection and resolution to physical sources for tally. INPUT/XPT preset text remains fixed `INPUT N`; physical HDMI/SDI/Still presets can use device labels. Panel-mode and routing combinations still need device testing. |
| HDMI/SDI/USB output assignment | Partial | Assignment actions exist. HDMI/SDI assignment state is polled; USB assignment is not included in periodic readback. This does not include output-format, scaler or color settings. |
| MONITOR [1]–[4] view assignments | Implemented | Assigns a view to each MONITOR button and exposes that assignment as feedback/variables. These are four **button assignments**, not four independent physical monitor outputs. The device display and HDMI OUT 3 view switch together. |
| Freeze | Implemented | Global On/Off, All/Select type, selection for **16 physical inputs** (HDMI 1–8 and SDI 1–8), Set Freeze modifier and dual-function PVW/Freeze presets. The 18-byte state block consists of global state, type and 16 selections. This build uses the original optimistic state handling, not the later bounded pending-state implementation prepared for upstream. |
| PiP/Key 1–4 | Implemented | Source, type, PGM/PVW state, position, size, crop, view position/zoom, shape/border and a broad set of key adjustments. Presence of a control does not establish its correct operation at every value. |
| DSK 1–2 | Partial | Direct actions for key/fill source, key type and PGM/PVW bus state. There are no separate Level/Gain/Mix Level adjustment actions. Capture/apply handles a subset of DSK settings and has the gain/mix discrepancy described below. |
| PiP/DSK capture, apply and local snapshots | Partial | Captures selected raw parameters and saves/loads/deletes JSON files on the Companion computer. PiP capture/apply includes 15 parameters: bus state, source/type, geometry and basic border settings. It omits key-level/gain/mix, chroma, custom RGB and despill parameters. DSK capture/apply includes nine parameter entries and is limited as described below. These are **not complete PiP/DSK or whole-device backups**. |
| Device labels | Implemented | Reads and writes 40 physical-source/bus label slots. Names are read on authentication and by Refresh Source Labels. Writes are limited to eight printable ASCII characters. Names are not continually polled. |
| Device memories 1–30 | Partial | Recall, save, initialize, name variables and memory presets. Memory names are read; no dedicated memory-name editor or device-memory USB import/export is provided. |
| Transitions | Partial | Mix/wipe type, mix pattern, wipe pattern/direction and transition-time actions. Dedicated CUT Take/AUTO Take actions have the address discrepancy below; generic panel-button controls use the documented CUT/AUTO addresses. No dedicated continuous AB-fader control is provided. |
| Device macros | Partial | Runs an existing macro 1–100. The module does not record, edit, copy, rename, import or export macros, and does not expose comprehensive macro execution state. |
| Sequencer | Partial | Generic panel actions include ON, AUTO SEQUENCE, PREVIOUS and NEXT. There is no sequence editor or detailed sequence-state feedback. |
| Panel buttons | Implemented | Generic press, release and press-and-release actions cover many front-panel buttons, including SPLIT, AUTO MIXING, CAPTURE, MODE, USER and sequencer buttons. Their effects depend on the device's current configuration. They do not provide full configuration or state feedback for those functions. |
| PTZ camera operation | Partial | Camera 1–16 selection, preset selection, pan/tilt and speed, zoom, focus/autofocus, exposure mode and tally-channel commands. Camera protocol, address, port and credentials must be configured separately on the device; there is no comprehensive camera telemetry. |
| Audio | Partial | AUX 1–3 mute actions/feedback and the generic AUTO MIXING panel-button option. This is not a full audio mixer control surface. |

Implementation references: [actions](src/actions.js), [source choices and panel buttons](src/constants.js), [feedbacks](src/feedbacks.js), [variables](src/variables.js), [presets](src/presets.js), and [capture/apply implementation](src/api.js#L1135-L1226). MONITOR semantics are documented in the [Control Guide, p.20](manuals/V-160HD_Control_eng06_W.pdf#page=20) and [Reference Manual, p.11](manuals/V-160HD_Reference_eng09_W.pdf#page=11).

## Known implementation discrepancies

These findings come from comparing the published source with the Roland Control Guide. No live-device test was performed to establish their exact symptoms, and no runtime fix is included in this documentation update.

### Dedicated CUT Take and AUTO Take addresses

The dedicated actions send `DTH:08001E,01;` and `DTH:08001F,01;`. The Control Guide defines the CUT and AUTO panel buttons at **`0B001E` and `0B001F`**. These dedicated shortcuts therefore do not match the documented panel-switch addresses and should not be treated as validated controls.

The generic **Press and Release Panel Switch** action offers CUT SW and AUTO SW with the documented `0B` addresses. That is an alternative command path to test, not evidence that all transition behavior has already been verified on hardware.

Evidence: [dedicated actions](src/actions.js#L1504-L1526), [generic panel action](src/actions.js#L1529-L1581), [CUT/AUTO choices](src/constants.js#L357-L358), [Control Guide, p.31](manuals/V-160HD_Control_eng06_W.pdf#page=31).

### DSK snapshot gain and mix-level mapping

The DSK capture/apply code treats Gain as a one-byte value at offset `07`, and Mix Level as a one-byte value at offset `09`. The Control Guide defines **Level at `06–07`, Gain at `08–09`, and Mix Level at `0A–0B`**, each as two bytes. The current Gain/Mix entries consequently point into the preceding parameters rather than their documented complete values.

DSK capture/apply must not be relied on for a complete, accurate gain/mix-level round trip. Its snapshot feature also omits advanced DSK settings such as chroma tuning, matte and edge parameters. A later code change and targeted device verification are needed before that broader behavior can be claimed.

Evidence: [DSK capture/apply code](src/api.js#L1189-L1226), [Control Guide, p.8](manuals/V-160HD_Control_eng06_W.pdf#page=8).

## Not exposed as dedicated module controls

This list covers the main device function groups checked against the bundled manuals; it is not a claim to enumerate every unsupported register. Generic panel actions and preconfigured macros may indirectly operate some functions listed here. The internal `sendRawCommand()` helper is not a user-facing raw-command action in this build.

| Device function | Missing dedicated support and available exceptions | Manual reference |
|---|---|---|
| Full audio mixing and processing | No general input/output level, gain, EQ/dynamics, delay, audio-follow, routing or automixing-settings controls. AUX mute and the AUTO MIXING panel-button option are exceptions. | [Reference, pp.41–52](manuals/V-160HD_Reference_eng09_W.pdf#page=41) |
| Video format and processing | No system/input/output format, scaler/color, HDCP or reference-clock settings. Source and output assignment are separately implemented. | [Reference, pp.12–16](manuals/V-160HD_Reference_eng09_W.pdf#page=12) |
| Panel operation and manual transition position | No dedicated panel-operation-mode selector or continuous AB-fader setting. Generic MODE and other panel-button actions are available. | [Reference, pp.17–20](manuals/V-160HD_Reference_eng09_W.pdf#page=17); [Control, p.8](manuals/V-160HD_Control_eng06_W.pdf#page=8) and [p.20](manuals/V-160HD_Control_eng06_W.pdf#page=20) |
| Split layout | No dedicated split-layout/geometry editor. Generic SPLIT button presses are available. | [Reference, p.30](manuals/V-160HD_Reference_eng09_W.pdf#page=30); [Control, p.6](manuals/V-160HD_Control_eng06_W.pdf#page=6) |
| Auto-switching setup | No dedicated scan-target, timing, order or mode configuration. An appropriately configured USER button or macro may trigger an existing setup. | [Reference, pp.21–24](manuals/V-160HD_Reference_eng09_W.pdf#page=21) |
| Still-image library management | No dedicated USB import/export, deletion or capture-setup controls. Selecting and naming loaded stills and pressing the generic CAPTURE button are available. | [Reference, pp.25–28](manuals/V-160HD_Reference_eng09_W.pdf#page=25) |
| Advanced DSK keying | No dedicated chroma tuning, matte/fill-mode or edge/color editor. Existing source/type actions and partial snapshots do not cover these settings. | [Control, p.8](manuals/V-160HD_Control_eng06_W.pdf#page=8); [Reference, pp.33–40](manuals/V-160HD_Reference_eng09_W.pdf#page=33) |
| Macro/sequence authoring | No recording, editing, copying, naming or import/export workflows. Running existing macros and basic sequencer panel-button commands are available. | [Reference, pp.58–71](manuals/V-160HD_Reference_eng09_W.pdf#page=58) |
| Whole-device backup and storage management | No device backup/restore, USB formatting or memory-file transfer. Local PiP/DSK JSON snapshots are a different, narrower feature. | [Reference, p.56](manuals/V-160HD_Reference_eng09_W.pdf#page=56) and [pp.72–73](manuals/V-160HD_Reference_eng09_W.pdf#page=72) |
| Multiview layout, overlays and tally/GPIO setup | No general multiview-layout, meter/OSD visibility, Smart Tally or GPIO configuration. Label contents and MONITOR button assignments are supported separately. | [Reference, p.11](manuals/V-160HD_Reference_eng09_W.pdf#page=11) and [pp.82–85](manuals/V-160HD_Reference_eng09_W.pdf#page=82); [Control, pp.20–21](manuals/V-160HD_Control_eng06_W.pdf#page=20) |
| PTZ camera registration | No camera protocol, IP address, port or login setup. Operational camera actions assume that configuration already exists. | [Control, p.30](manuals/V-160HD_Control_eng06_W.pdf#page=30); [Reference, pp.76–77](manuals/V-160HD_Reference_eng09_W.pdf#page=76) |
| External recorder REC CONTROL | No dedicated recorder-control action. A preconfigured USER button or macro may operate a compatible HDMI recorder indirectly. | [Reference, p.75](manuals/V-160HD_Reference_eng09_W.pdf#page=75) |

The V-160HD's streaming workflow described in the [Reference Manual, p.53](manuals/V-160HD_Reference_eng09_W.pdf#page=53) sends USB video/audio to a computer running streaming or recording software. This module does not control that external software. This should not be confused with a missing on-device RTMP encoder or an internal video recorder, which that workflow does not provide.

## Reporting gaps and test results

Use [GitHub Issues](https://github.com/ReloadMediaOy/companion-module-roland-v160hd/issues/new/choose): **Bug report** for incorrect behavior, **Test report** for successful or incomplete validation, and **Feature Request** for additional controls. Include the module, Companion and firmware versions, and distinguish a missing control from a control that exists but did not behave as expected.
