# Web dependency security patch — 2026-09-09

## Scope and approval

The founder approved patching and redeploying the dependencies flagged by Security run 91 for commit `013f46e`. This release changes dependency manifests, generated lockfiles and deployment packaging, with regression tests and this evidence record. Application behaviour, React 19.2.4, authentication policy, database migrations and customer file storage are unchanged. The processor needs no code update for this patch.

## Findings addressed

- `next`: 16.2.12 → 16.3.3; matching `eslint-config-next` upgraded to 16.3.3.
- `sharp`: the workspace minimum is now 0.35.4. Both tracked lockfiles resolve 0.35.4, with updated native dependencies. The installed image library reports libheif 1.23.2.
- Root workspace and existing app-level lockfiles were regenerated using the repository's pnpm 10.12.1. No advisory suppressions or weakened audit thresholds were added.

Maintainer references:

- [Next.js 16.3.3 security release](https://github.com/vercel/next.js/releases/tag/v16.3.3)
- [Windows-hosted Next.js RCE advisory](https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36)
- [Next.js AVIF image-optimization advisory](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4)
- [sharp / libheif advisory](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c)

These were dependency findings, not evidence of exploitation. One Next.js finding is specific to Windows-hosted servers; the dependency upgrade also protects the local Windows development environment. The AVIF-related findings require the patched image-processing dependencies independently of that Windows-only issue.

## Pre-release verification

- Frozen lockfile installation passed with pnpm 10.12.1.
- Production dependency audit (`pnpm audit --prod --audit-level high`) returned **No known vulnerabilities found**.
- Installed runtime verified: Next.js 16.3.3, sharp 0.35.4, libheif 1.23.2.
- TypeScript typecheck and ESLint passed.
- All 439 tests in 72 web test files passed, including deployment-mode and security-header regressions.
- Next.js 16.3.3 production builds passed with standalone output and Vercel-mode output; authenticated application and API routes remain dynamic.
- Existing migration and tracked-secret guards passed.

Local validation used Node.js 24.19.0. Hosted CI additionally tests using the repository's configured Node.js 22. Production deployment and final CI/security outcomes are recorded in the release handoff; do not interpret pre-release verification as hosted completion.

## Deployment and recovery

The first patch commit, `b438156`, passed hosted CI run 88 and Security run 92, but its Vercel build failed while copying standalone output (`.next/next-server.js.nft.json` missing). The previous live deployment was unaffected. Next.js runs the hosting adapter before standalone packaging, so the follow-up lets Vercel use its native adapter output and retains standalone output everywhere else. Regression tests cover both deployment modes and unchanged security/cache headers.

Publish through the existing `Glitterpen/EngiVault` main-branch deployment to the Vercel `engicite-staging` project serving `app.engicite.com`. Confirm the exact commit becomes Ready, CI and Security pass, and the public login page loads. No SQL or storage migration is required.

Do not roll back to 16.2.12/sharp 0.35.3 as a security resolution: that restores the flagged dependencies. If a regression occurs, prefer a forward fix retaining the patched versions; an operational rollback needs explicit security-owner review. No customer documents, identities or organisation records are modified by this patch.
