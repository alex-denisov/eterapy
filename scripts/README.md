# Repository operations scripts

## GitHub Actions monitor

`ci_monitor.cjs` is the canonical observable wrapper around GitHub Actions for
agents and local operators. It invokes `gh` with argument arrays (never a shell
command string), disables the pager and returns the wrapped command's exit
status.

```bash
node scripts/ci_monitor.cjs --help
node scripts/ci_monitor.cjs runs --branch main
node scripts/ci_monitor.cjs watch <run-id>
node scripts/ci_monitor.cjs log-failed <run-id>
node scripts/ci_monitor.cjs test-summary <run-id>
node scripts/ci_monitor.cjs check-actions
node scripts/ci_monitor.cjs grep <run-id> --pattern 'error|failed'
node scripts/ci_monitor.cjs wait-for <run-id> 'Health check' --keyword 'healthy'
```

`watch` and `fail-fast` terminate non-zero when the workflow does. `wait-for`
requires both a successful matching job and the expected log keyword, so a
green job without the observable deployment evidence is not accepted.

Run the regression test with:

```bash
npm run ci:monitor:test
```
