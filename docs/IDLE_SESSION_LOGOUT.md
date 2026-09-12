# Ten-minute click inactivity logout

The root application layout mounts one role-independent session guard. It applies
to organisation administrators, project managers, DCC, engineers, Executive
Viewers, Founders, and audited previews, as well as authenticated onboarding.

- A trusted click (including touch or keyboard activation of a control) resets
  the ten-minute timer. Typing, scrolling, pointer movement, token refreshes,
  background requests and navigation alone do not reset it.
- Activity is shared across tabs on the same origin, keyed by user and auth
  session ID. Reloading does not reset the stored deadline. A fresh login gets
  a fresh deadline. No credentials are stored by the inactivity timer.
- On expiry, private content unmounts. A same-origin POST revokes the current
  auth session and clears the administrator-preview cookie. The client clears
  its auth state and performs a full navigation to the appropriate sign-in page.
- A suspended page is checked on focus, visibility change and pageshow. A late
  click is blocked rather than extending an already-expired deadline.
- If logout fails or the network is offline, the workspace remains locked and
  logout retries. No unsaved form or upload completion is promised after timeout.
- Local storage restrictions fall back to an in-memory timer; cross-tab and
  reload persistence cannot be guaranteed in that browser mode.

This is browser inactivity handling, not a new database/RLS policy or a substitute
for server-side session lifetime limits. A suspended/closed browser cannot run
JavaScript until resumed. Already-issued access tokens retain their provider-set
lifetime; refresh-session revocation does not instantly revoke a copied JWT.
No claim of SOC 2 certification is made by adding this control.

Deployment requires the web update only, with no database migration, new secrets,
or processor change. Check the live sign-in/timeout journey after deployment.
