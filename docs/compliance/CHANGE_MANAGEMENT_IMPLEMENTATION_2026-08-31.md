# EngiCite Change Management Control Implementation

**Control owner:** Engineering Lead

**Independent reviewer:** To be appointed

**Effective status:** Partially implemented
**Review frequency:** Each production change; quarterly control review

## Control objective

Only authorised, tested, independently reviewed and traceable changes may reach EngiCite production. Emergency changes must be limited, recorded and independently reviewed no later than the next business day.

## Completed technical remediation

- The processor configuration test now removes the CI-provided `MALWARE_SCAN_MODE` value before testing the fail-closed missing-setting condition.
- The CI-equivalent processor suite passed locally on 31 August 2026: **50 tests passed**.
- Pull requests capture change type, risk, data impact, validation, deployment, recovery and independent approval.
- Security-sensitive paths remain covered by `CODEOWNERS`.

## Required GitHub ruleset for `main`

Create an active branch ruleset targeting `main` with these controls:

- Require a pull request before merging.
- Require at least one approval from a person other than the author.
- Require review from Code Owners for matching paths.
- Dismiss stale approvals when new commits are pushed.
- Require resolution of all review conversations.
- Require the branch to be current before merge.
- Require successful checks for the web and processor CI jobs, secret scan, dependency audit, CodeQL and dependency review.
- Block force pushes and branch deletion.
- Prevent direct pushes to `main`.
- Limit bypass rights to a named emergency role; every bypass must create an emergency-change record.

## Human-control blocker

The current repository has one named CODEOWNER, `@Glitterpen`. Independent review cannot be evidenced until a second qualified person or GitHub team is appointed. After appointment:

1. Add the reviewer with the minimum repository role needed to review pull requests.
2. Create a security-review team if the GitHub plan supports it.
3. Replace or supplement the single CODEOWNER entry with that approved reviewer/team.
4. Test the rule with a pull request authored by `@Glitterpen` and approved by the independent reviewer.

## Evidence to retain for every release

- Pull-request URL and change owner.
- Risk rating and affected systems/tenants.
- Independent approval and CODEOWNER approval when applicable.
- Required-check results and test artifacts.
- Deployment identifier, environment and deployer.
- Post-deployment validation and monitoring result.
- Rollback or forward-fix plan.
- Any exception, incident link and next-business-day review.

## Quarterly operating evidence

- Export or screenshot of the active `main` ruleset.
- Current repository access list and reviewer independence check.
- Sample of normal and emergency changes.
- List of bypasses, direct pushes and failed required checks.
- Control-owner review, exceptions and dated remediation actions.

## Completion criteria

This control becomes fully implemented only when the second reviewer is appointed, the `main` ruleset is active, a test pull request proves enforcement, and the evidence is stored in the controlled security evidence repository.
