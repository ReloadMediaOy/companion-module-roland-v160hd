# Roland V-160HD community test guide

**Version 2.5.1-beta.1** is an unofficial ReloadMediaOy test build for Bitfocus Companion. It includes source selection, tally feedback, dynamic source names, Freeze controls, PiP/DSK controls and snapshots. It uses the original 2.5.0 implementation at [commit `757da28`](https://github.com/roopeberg/companion-module-roland-v160hd/tree/757da284994835383262349c7efd998ed89cac91), with unchanged runtime JavaScript. It is not an official Bitfocus release; testing on different hardware setups is still needed.

## Requirements

- Companion **5.x**, with support for module API 2.1.3 and the Node 22 runtime.
- Roland V-160HD firmware **1.04 or later**, with a remote-control password configured.
- Network access from the Companion computer to the switcher.

Export a backup of your current Companion configuration before changing the module version. Try the build in a test setup before using it for a live production.

## Install the module

1. Download **`roland-v160hd-2.5.1-beta.1.tgz`** from the release assets. Keep it compressed; do not extract it or use GitHub's automatic source-code ZIP.
2. Open the browser interface of the Companion instance that will control the switcher. If Companion runs on another computer, you can open its interface over the network and upload the file from your own computer.
3. Open **Modules → Import module package** and select the `.tgz` file.
4. Open your **Roland V-160HD** connection and select module version **2.5.1-beta.1**. Enable the beta-version filter if needed to find it.
5. Check the switcher's IP address, enter its password and click **Save**. Enable polling for feedback and state updates.

The package includes the module and its presets. It does not include your existing buttons, pages, connection settings or saved snapshots. Transfer buttons and settings separately with Companion's export/import tools. Snapshot files are stored separately in `~/v160hd-snapshots/` on the Companion computer.

## Password and connection setup

**Re-enter the Password field and save it when upgrading an existing connection or transferring settings.** This version uses Companion's separate secret storage. An older saved password is not automatically migrated, which can cause an authentication error even when the old configuration worked.

The V-160HD accepts one TCP control connection at a time. Disable any other Companion connection to it and close Roland RCS before testing. A successful connection shows **OK** and logs **Authenticated.** Do not share your password in a test report.

## Names and presets

Add the presets supplied by this version to try its dynamic names and feedback. Existing buttons with manually entered text retain that text.

- **Set Device Label** writes a source name to the Roland. Choose a **Target** and enter a **Label**, then execute the action. Use up to **8 printable ASCII characters**, such as `CAMERA 1`; avoid accented characters.
- Names are read when the connection authenticates. After renaming a source on the Roland itself, execute **Refresh Source Labels**. Names are not continuously polled.
- Physical HDMI/SDI/Still source presets use dynamic labels. **INPUT/XPT 1–20** buttons still display fixed `INPUT N` text.

## Useful tests

Try source selection and tally feedback, naming and refreshing an input, and Freeze On/Off and per-input selection. Confirm that releasing **Set Freeze** returns the combined input buttons to normal PVW selection. Check reconnection and any PiP/DSK or snapshot functions you normally use.

## Feedback

Submit feedback through [ReloadMediaOy GitHub Issues](https://github.com/ReloadMediaOy/companion-module-roland-v160hd/issues/new/choose).

- Choose **Bug report** for a problem. Report one problem per issue and include steps to reproduce it, the expected behavior and what actually happened.
- Choose **Test report** to share successful tests, partial results or failures on your setup. Describe what you tested and link any related bug reports.
- Choose **Feature Request** for a proposed improvement.

Search existing issues first and add related findings to the existing report where possible. The forms ask for your module version, Companion version, operating system and V-160HD firmware. Remove passwords and other sensitive information from screenshots and logs. Discussion in the tester group is welcome; GitHub keeps the findings and their resolution together.
