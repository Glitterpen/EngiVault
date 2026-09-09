# Contextual help icons

## Change

Optional hints, workflow guides and explanatory copy now use a shared question-mark icon. Guidance opens on hover, keyboard focus or a phone tap, without expanding the normal page layout. Tap again, tap elsewhere, leave the hover area or press Escape to dismiss it. Escape dismisses the popup before an enclosing dialog.

Covered UI areas: organisation selection and account settings; sign-in, registration, password and founder access; project dashboards, team and resources; discipline management and allocation; MDR registration/import and document planning; deliverable requests; submission review; progress and generated reports; evidence search and Ask EngiCite; transmittals, work packages, backups and administrative previews.

Field guidance uses explicit label/input associations, with the help button outside the label. Help buttons are non-submit controls and remain usable in audited read-only previews without unlocking changes. Popup text uses the browser top layer where supported so scrolling cards and dialogs do not clip it. Popups are sized to the viewport and hidden when printing.

## Intentionally still visible

- Validation failures, security notices, processing failures and action-required messages.
- Deletion confirmations, consequences, acknowledgements and access restrictions.
- Required file constraints, native-source requirements, current status, deadlines, report data and empty states.
- Subscription prices, renewal/expiry information and data-continuity statements.
- Recovery/navigation buttons, marketing content and operational instructions needed to complete verification.

No authorisation rules, database schema, stored records, uploaded files, email templates or PDF-generation logic changed. No migration is required.

## Verification

- TypeScript and ESLint passed.
- Full web test suite: 451 tests passed across 74 files, including new shared-help, field-association, authentication-notice and read-only-preview regression coverage.
- Browser checks at 390×844, 768×1024 and 1440×900: no page overflow; hover/tap/focus interaction, tooltip bounds, scrolling-dialog visibility and Escape handling passed without browser errors.
- Production-mode Next.js build passed. The isolated local browser-preview route was removed before building.

This verification was completed locally before release. Deployment uses the existing GitHub-to-Vercel production pipeline; no database or processor deployment is needed. Temporary screenshots in `tmp/ui-hints` are local QA evidence, not release assets. Next.js also refreshed its generated `apps/web/AGENTS.md` guidance during the preview run.
