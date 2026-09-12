# EngiCite shared UI/UX review

## Scope

Source review of the authenticated workspace shell, role navigation, account menu,
shared styles, MDR listing, document registration, project invitations and Excel
import. This is a shared-component optimisation pass, not a complete visual audit
of every authenticated role/page or an accessibility certification.

## Implemented

- Native, labelled modals for registration and invitations. Browser-managed focus
  containment, Escape dismissal, explicit close buttons and focus return; drafts
  remain mounted after first opening. Body scrolling is restored on close/unmount.
- Account menu dismisses with Escape, outside interaction, focus departure and
  navigation. Mobile workspace menu supports Escape/outside dismissal and exposes
  its controlled navigation region to assistive technology.
- Skip-to-content links in standard and executive workspace shells.
- Shared visible keyboard focus, readable primary-button colour, wrapping button
  labels, disabled secondary-button states and minimum 44px button height.
- Mobile shared inputs use 16px text; textareas have usable height and resizing.
- Reduced-motion preferences are respected; help controls are larger on phones.
- MDR keeps all columns available in a keyboard-focusable horizontal scrolling
  region, including on tablets; document numbers/titles can wrap. Removed the
  global positional CSS that silently hid table columns.
- Notification fetch failures show an explicit retry state, never an empty inbox.
  Bulk actions expose pending states and disable repeated submission; destructive
  confirmation and read-only previews are preserved. Mobile headings wrap and
  read notifications retain their text contrast.
- MDR edit/delete/restore row actions use 44px minimum-height touch targets.
- Engineer assignment/revision query failures display a retry state rather than
  empty scope or missing revisions. Unavailable aggregate project progress is
  explicitly labelled and hidden instead of substituted with discipline values.

## Verification and limitations

- Regression tests cover modal open/close, draft retention, scroll restoration,
  account-menu dismissal and mobile-navigation dismissal.
- Local browser check with the real shared dialog and compiled application CSS
  confirms modal isolation and focus returning to its opener.
- No customer records, permissions, notification preferences or workflows changed.
- No database migration is required. Changes are not deployed by this task.
- Follow-up: authenticated visual checks of each role at phone/tablet/desktop
  widths, screen-reader checks and usability testing with representative users.
  Dense MDR scrolling should be evaluated with DCC users before a larger card-view
  redesign. No claim is made that all authenticated screens were visually tested.
