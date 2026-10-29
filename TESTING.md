# Test evidence and device test checklist

Applies to the **2.5.1-beta.2 community test build**, based on the original runtime at `757da284994835383262349c7efd998ed89cac91` plus the dedicated CUT/AUTO correction. Reviewed 2026-10-29. See [FEATURE-SUPPORT.md](FEATURE-SUPPORT.md) for missing or partial controls and known implementation discrepancies.

**Needs a documented device test** means that we do not yet have a reproducible test record for this beta and setup. It does not mean that nobody has ever used the feature successfully. Source code, a unit test and a successful real-device workflow are different kinds of evidence.

## Evidence already available

**Validation:** 124 automated tests passed in 24 suites on Node 22.23.1. These are simulated-code tests, not switcher tests.

The original beta.1 baseline passed **113 automated tests in 23 suites on Node 22.23.1**. Current build coverage is:

| Test file | Tests | Scope |
|---|---:|---|
| `tcpParser.test.js` | 23 | Split/combined TCP messages, incomplete tails, authentication prompts and delimiter ordering |
| `queue.test.js` | 6 | Selected queue ordering, high-priority scheduling, clearing/generation guards and command termination |
| `multibyte.test.js` | 31 | Block validation and parsing of selected Freeze, source, output, AUX-link, PiP-tally and memory-name responses |
| `sourcelabels.test.js` | 26 | Selected address mappings, ASCII/NUL handling, invalid replies, label writes and readback |
| `inputassign.test.js` | 27 | INPUT1–20 query/mapping boundaries, assignment parsing, resolution and source-choice boundaries |
| `take.test.js` | 11 | Dedicated CUT/AUTO callbacks, queued press/release ordering and spacing, source-state publication, explicit connection teardown and existing preset bindings |
| **Total** | **124** | Simulated inputs/sockets; selected production API methods |

The beta.2 build adds 11 tests in `test/take.test.js` for the real dedicated CUT/AUTO action callbacks and their queue behavior: documented addresses, press/release ordering, repeated takes, write priority/spacing, preserved source-refresh requests and absence of fabricated CUT source state. These tests do not demonstrate that a real switcher accepts the nominal 20 ms pulse or completes a transition.

The suite still does not comprehensively test other action callbacks, feedback/preset rendering, snapshot files, PTZ, polling-tier timing, connection lifecycle or the complete authentication flow. A parser test recognizing a password prompt does not prove successful login to a switcher.

The original [checklist at `757da28`](https://github.com/roopeberg/companion-module-roland-v160hd/blob/757da284994835383262349c7efd998ed89cac91/TESTING.md) records limited historical device checks: selected two-byte PiP read sizes, selected PiP1 addresses and the horizontal/vertical position range. It does not record the tested firmware/Companion versions or verify all four PiP channels. Preserve these as **historical partial verification**, and repeat them with a recorded environment.

A user reported successful authentication after re-entering the password and improved operation. That is useful field feedback, but it does not mark every function below as passed. Later upstream Freeze test suites and emulator captures concern different code and are not counted as evidence for this package.

**Camera testing context:** The publisher uses this V-160HD mainly with presentation computers rather than for camera production and has not tested its camera-control functions at all. PTZ movement, camera presets, focus, exposure-mode and camera-tally controls are implemented, but have not been device-validated by the publisher. Test reports from users with camera setups are welcome.

**Field report — 2026-10-29:** A user reports that **CUT Take does not work in version 2.5**. This is a user-reported device failure, not an independent reproduction or a verified fix. The exact module patch/build, firmware and detailed reproduction steps were not supplied. The report is consistent with the CUT address discrepancy; it does not confirm an AUTO Take failure.

`test/integration.js` and `test/restore.js` are separate scripts that can connect to and change a real switcher. They are not run by `yarn test`, and no completed result from them is included in this release's evidence.

## Implemented functions still needing documented device testing

| Area | Current evidence | What still needs checking |
|---|---|---|
| Authentication/reconnection | Prompt parsing; limited user login report | Fresh/imported settings, wrong password, network loss, reconnect, repeated configuration saves and long sessions |
| Polling/traffic | Selected queue and response-parser unit tests | Continuous polling with repeated controls, startup load, delayed/lost traffic, queued writes during reconnect and a single polling loop after config changes |
| PGM/PVW/AUX selection and tally | Response parsing and assignment-resolution tests | Actual bus output, independent feedback, physical versus INPUT sources, panel changes and simultaneous tally combinations |
| INPUT/XPT1–20 | Query/mapping/choice-boundary tests | All used slots, device-side reassignment, reconnect and relevant panel-operation modes; preset text remains `INPUT N` |
| Freeze | 18-byte response parsing | Global/type controls, all 16 input selections, Set Freeze press/release, rapid operations, panel changes and reconciliation after reconnect |
| PiP/Key1–4 | Historical partial PiP1 checks; tally parsing | All four channels, exposed geometry/key/border controls, sources, on-air state and the supported capture/apply subset |
| DSK1–2 | No complete device workflow record | Sources/type/bus controls; **resolve the known gain/mix snapshot discrepancy before treating Capture/Apply as a valid round trip** |
| Snapshot files | Implementation present; outside the automated suite | Save/load/delete, restart, file transfer between computers and restoring the intended supported parameter subset |
| Memories | Name decoding tests | Exposed recall/save operations, slots1/30, last-loaded feedback, names and changes made on the device |
| Source labels | Mapping/decoder/write/readback helper tests | All 40 targets, actual device labels, explicit refresh after panel edits and dynamic preset text |
| Output routing | Six-output response parsing | Each HDMI/SDI assignment; USB routing and its limited state-refresh behavior |
| MONITOR button assignments | Implemented controls/readback | All four button assignments and the resulting device-monitor/HDMI OUT3 behavior; not four independent physical outputs |
| Transition controls | **CUT Take failure reported on version 2.5**; beta.2 corrects dedicated CUT/AUTO addresses and adds queued press/release tests | Verify corrected CUT/AUTO on hardware, including the nominal 20 ms pulse, repeated takes, real output and returned source state. Record firmware, panel mode, transition settings and timing; test AUTO completion and mix/wipe separately. |
| AUX mute/link | Selected AUX-link parsing | Actual audio mute/link behavior and device-side changes across AUX1–3 |
| PTZ cameras | **Not tested at all by this build's publisher**; no comprehensive automated/device evidence recorded for this beta | Each used camera/model: movement and stop, speed, zoom/focus, exposure-mode, camera-preset and tally-channel commands. Reports from camera users are needed. |
| Macros/panel controls | Implemented paths outside the standard suite | Each configured macro or panel command, momentary release and interaction with the switcher's current setup |
| Companion UI/platforms | Package validation and limited user use | Actual preset rendering, combined feedback styles, modifier release, variable text and the target Windows/macOS/Linux/Raspberry Pi setup |

## Suggested test order

1. **Record the environment.** Module version, Companion version/build, operating system, V-160HD firmware, camera models if used, polling setting/interval and panel-operation mode. Back up the configuration and use a test setup.
2. **Connect and recover.** Re-enter Password and Save. Confirm authentication, then check a controlled disconnect/reconnect and a configuration save. Look for one polling loop and recovery of actual state, rather than only an OK status.
3. **Check sources and feedback against real outputs.** Start with physical HDMI/SDI, then assigned INPUT slots. Change sources from both Companion and the switcher. Check PGM, PVW and each AUX independently and in combinations. Include the panel modes actually used in your workflow.
4. **Check timing at your selected interval.** At the default 1000 ms, fast/medium/background reads occur every 1/2/10 seconds. At 500 ms they occur every 0.5/1/5 seconds. All tiers are requested once on startup, but responses and labels still take time. Confirm responsiveness while sending repeated controls; do not equate the nominal request count with measured delivery latency.
5. **Check names and memories.** Names for 30 memory slots rotate in approximately 60 seconds at 1000 ms, or 30 seconds at 500 ms. After a source rename on the device, run Refresh Source Labels. Test an eight-character printable-ASCII label, its readback and a reconnect; verify the device and preset show the same name.
6. **Check Freeze.** Test global On/Off and All/Select, then HDMI1–8 and SDI1–8 individually. Hold Set Freeze while selecting an input, release it, and confirm that the next normal input press selects PVW again. Check rapid presses and panel changes against the actual device state; local optimistic display alone is not a pass.
7. **Check PiP/DSK and snapshots in isolation.** Test source/type/bus controls first. Capture known values, change them, apply the captured subset and compare the actual result. Snapshot files do not include every device parameter. Keep the known DSK gain/mix discrepancy separate from a successful PiP test; do not mark the entire snapshot system passed from one example.
8. **Verify the corrected dedicated CUT/AUTO actions.** Choose distinct PGM/PVW sources. Run CUT and check the actual output and source feedback. Repeat CUT, then test repeated/alternating takes to check that release is not left pending. Test AUTO with known transition settings, waiting for completion before judging its final state. Repeat with polling enabled and disabled, recording any state-refresh difference. Verify that the nominal 20 ms queued pulse is accepted by the switcher; automated tests cannot establish this. Record the exact action/preset used: generic panel-switch actions are a separate, unchanged implementation.
9. **Check other panel controls, macros and cameras separately.** For PTZ, test stop/release behavior as well as starting motion. Camera functions remain untested by this build's publisher.

## Recording a result

Submit a [Test report](https://github.com/ReloadMediaOy/companion-module-roland-v160hd/issues/new?template=test_report.yml). List each tested feature as **passed**, **failed** or **not completed**, with steps, expected behavior and actual observations. Include short relevant logs or screenshots with passwords removed. A partial test report is useful; leave untested rows open.

For a reproducible problem, file one [Bug report](https://github.com/ReloadMediaOy/companion-module-roland-v160hd/issues/new?template=bug_report.yml) and link it from the test report. Repeated confirmation of the same problem belongs in the existing issue. Unsupported dedicated features belong in the support matrix or a Feature Request, rather than being marked as a failed implementation.
