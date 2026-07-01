# Salesforce Setup Navigator

Jump from a local Salesforce metadata file straight to the matching **Salesforce Setup** page — without copying API names and searching through Setup by hand.

Right-click a supported metadata file in VS Code and pick a **Salesforce** action: open it in Setup, copy a shareable Setup URL, open the Developer Console, run Apex tests, or switch the target org.

## Features

| Command | What it does |
| --- | --- |
| **Salesforce: Open in Setup** | Opens the matching Setup page for the selected metadata in your browser. |
| **Salesforce: Copy Setup URL** | Copies a clean, shareable Setup URL to the clipboard. |
| **Salesforce: Open Developer Console** | Opens the Developer Console — focused on the selected Apex class/trigger/page when it can be resolved. |
| **Salesforce: Select Org** | Picks which authenticated org to target, and remembers it. |
| **Salesforce: Run Apex Tests** | Pick test classes from a searchable multi-select, run them with code coverage, and read the results in a report that opens at the top — coverage for the classes under test is listed first. The selected classes are copied to the clipboard as a comma-separated list, ready to paste into a deploy. |

### Supported metadata (v1)

Apex Class · Apex Trigger · Visualforce Page · Flow · Custom Object · Custom Field · Validation Rule.

Right-click any of these in the Explorer or editor and use the **Salesforce ▸** submenu. Flows open in Flow Builder; objects/fields/validation rules open in Object Manager.

### Running Apex tests

Run **Salesforce: Run Apex Tests** from the Command Palette, or right-click an Apex class and choose **Salesforce ▸ Run Apex Tests** (that class comes pre-selected). Then:

1. Pick one or more test classes from the searchable, multi-select list.
2. The chosen class names are copied to your clipboard as a comma-separated list (e.g. `AccountSelectorTest,CaseTriggerTest`) — paste it straight into a `RunSpecifiedTests` deploy.
3. The tests run with code coverage and a read-only report opens scrolled to the top: a pass/fail summary, each failure with its message and stack trace, then code coverage with the **classes under test listed first** and everything else after. The comma-separated list is repeated at the bottom so you can copy it again anytime.

## Requirements

- **[Salesforce CLI](https://developer.salesforce.com/tools/salesforcecli) (`sf`)** installed and on your `PATH`.
- An authenticated org (`sf org login web`).
- A project that follows the standard Salesforce DX source format (`force-app/main/default/…`).

The extension delegates all authenticated work to the Salesforce CLI — it **never reads or stores your access token**. "Copy Setup URL" produces a plain instance URL (the recipient must be logged into the org), not a tokenized link.

## How it works

1. The metadata type and names are detected from the file path.
2. The target org is resolved from the `salesforceSetupNavigator.targetOrg` setting, or your CLI's default `target-org`.
3. For items that need a Salesforce record id (Apex, Custom Field, Validation Rule), the id is looked up on demand via the Tooling API (`sf data query --use-tooling-api`).
4. The page is opened with `sf org open` (which handles login), or — for Flows — `sf org open --source-file` opens the associated Builder.

If an exact deep link can't be resolved (for example, the metadata hasn't been deployed to the org yet), the extension gracefully opens the relevant Setup **list** page instead and tells you.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `salesforceSetupNavigator.targetOrg` | `""` | Alias or username of the org to open. Empty = use the project's default org. Set it via **Salesforce: Select Org**. |
| `salesforceSetupNavigator.salesforceCliPath` | `"sf"` | Path to the Salesforce CLI executable. |

## Known limitations

- Salesforce does not publish stable deep links for every Setup page; unresolved items fall back to a list page.
- **Open Developer Console** uses an unofficial Salesforce URL (`ApexCSIPage?action=openFile`) to open the selected Apex class/trigger/page directly. It is not officially supported and may change; on a freshly-opened ("cold") console the file tab can briefly show as `undefined.apxc` until Salesforce resolves the name — it loads reliably when the Developer Console is already open. If the id can't be resolved, the command opens the console itself.
- Custom fields/objects from managed packages are matched by their bare developer name and namespace; Apex classes, triggers, and Visualforce pages are matched by name only.
- Multi-select in the Explorer acts on the file you right-clicked.

## Development

```bash
npm install        # install dev dependencies
npm run compile    # type-check (tsc)
npm test           # run unit tests (detector, URL builder, Apex test runner)
npm run bundle     # produce dist/extension.js (esbuild)
npm run package    # produce a .vsix (requires the publisher field below)
```

Press **F5** in VS Code to launch an Extension Development Host with the extension loaded.


## License

MIT
