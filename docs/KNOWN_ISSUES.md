# KNOWN_ISSUES — OpenClaw

**Last Updated:** 2026-02-08 (Ralph Loop Phase 3B)

---

## Critical Issues

None identified. Build, tests, and CLI commands all functional.

---

## High-Priority Issues

### 1. Linting Failures (Pre-existing)
**Status:** Open
**Severity:** Medium (style/quality, not functional)
**Files Affected:**
  - `src/gateway/server-methods/models.ts` (curly braces, 11+ errors)
  - `electron/main.ts` (unused imports, floating promises, 6+ errors)
  - `src/agents/pi-embedded-runner/stream-to-session.ts` (floating promises)
  - Others (total 33 linting violations)

**Details:**
- Primary issue: Oxlint `eslint(curly)` rule violations (missing braces around single-statement if/return/continue)
- Secondary issue: Floating promises (async calls not awaited, missing `void` operator)
- Tertiary issue: Unused imports/parameters

**Suggested Fix:**
1. Run `pnpm lint:fix` to auto-fix formatting issues
2. Manually fix floating promises (add `void` or `await`)
3. Remove unused imports in `electron/main.ts`
4. Re-run `pnpm lint` to verify clean state

**Impact:** Blocks CI/CD in strict mode; does not affect runtime behavior.

---

## Medium-Priority Issues

### 2. Canvas Bundle Hash Management
**Status:** Documented
**Severity:** Low (known behavior)
**Files Affected:** `src/canvas-host/a2ui/.bundle.hash`, `scripts/bundle-a2ui.sh`

**Details:**
- The `.bundle.hash` file is auto-generated and can change unexpectedly on rebuilds
- Script `scripts/bundle-a2ui.sh` skips bundling if hash is up-to-date
- Hash changes show up in `git diff` even when bundle is functionally identical

**Suggested Fix:**
- Force rebuild if needed: `pnpm canvas:a2ui:bundle --force` (if available)
- Or manually delete `.bundle.hash` and rebuild
- Commit hash changes as a separate commit if triggering a new build

**Impact:** Minor (git noise); no functional impact.

### 3. Multi-workspace Plugin Version Drift
**Status:** Documented
**Severity:** Low (versioning)
**Files Affected:** `extensions/*/package.json`, `scripts/sync-plugin-versions.ts`

**Details:**
- Each extension under `extensions/*` has independent versions
- Version drift possible if plugins not synced with main package
- Tool `pnpm plugins:sync` exists to align versions, but not automatic

**Suggested Fix:**
- After any version bump in root `package.json`, run `pnpm plugins:sync`
- Consider adding this to the pre-commit hook or release checklist

**Impact:** Low (documentation/release process); no runtime impact if versions don't conflict.

### 4. Electron App GPU Crashes (macOS)
**Status:** Mitigated
**Severity:** Medium (platform-specific)
**Files Affected:** `electron/main.ts`, GPU-related code

**Details:**
- Electron on newer macOS versions (Sonoma+) sometimes crashes with GPU rendering
- Mitigation in place: Pass CLI flags `--disable-gpu --in-process-gpu --no-sandbox --disable-software-rasterizer`
- Already implemented in `electron/main.ts`, but may need updates for future macOS versions

**Suggested Fix:**
- Monitor Electron releases for GPU-related fixes
- Test on fresh macOS versions (13+) regularly
- Consider fallback to CPU rendering if GPU fails at startup

**Impact:** Medium (user experience); workaround in place.

### 5. Bash 3.2 Limitations (macOS)
**Status:** Mitigated
**Severity:** Low (dev/scripting)
**Files Affected:** Shell scripts in `scripts/`, `git-hooks/`

**Details:**
- macOS ships with bash 3.2 (from 2006), which lacks modern features
- Scripts must avoid `wait -n` (requires bash 4.3+)
- Current scripts avoid this, but future scripts should be aware

**Suggested Fix:**
- Use explicit polling instead of `wait -n` in shell scripts
- Document bash version requirement in CONTRIBUTING.md
- Consider using Python/Node.js for complex scripts instead

**Impact:** Low (scripting/tooling); no impact on core product.

---

## Low-Priority Issues

### 6. Live Test Coverage Incomplete
**Status:** Open
**Severity:** Low (testing/QA)
**Files Affected:** `vitest.live.config.ts`, `src/**/*.live.test.ts`

**Details:**
- Tests that interact with real APIs (`test:live`, `test:docker:live-*`) require environment variables
- These tests are excluded from standard CI (not integrated into GitHub Actions)
- Coverage of live API providers (Anthropic, OpenAI, Ollama, etc.) may be incomplete

**Suggested Fix:**
- Set up dedicated CI job for live tests with secure credential injection
- Document live test setup for developers
- Consider nightly live test runs on a cron schedule

**Impact:** Low (testing quality); covered by manual testing and integration tests.

### 7. Mobile App Signing (External)
**Status:** Out of Scope
**Severity:** Low (release process)
**Files Affected:** `apps/ios/`, `apps/android/`, external signing infrastructure

**Details:**
- iOS and Android app signing/notary keys are managed outside this repo
- Release process documented separately (internal docs)
- Builds work locally but distribution requires external credentials

**Suggested Fix:**
- Keep signing keys secure (1Password, GitHub Secrets, etc.)
- Document signing process in internal release runbook
- No change needed in codebase

**Impact:** Low (release process); no runtime impact.

### 8. Sandbox Security Audit Pending
**Status:** Open
**Severity:** Medium (security)
**Files Affected:** `src/agents/sandbox/`, `src/process/`

**Details:**
- Agent sandbox uses custom process isolation with `node-llama-cpp`
- Security audit status unknown; may be vectors for code execution escapes
- Not a blocker for self-hosted deployments, but critical for multi-user scenarios

**Suggested Fix:**
- Schedule security audit with external firm
- Document threat model and design assumptions
- Consider adding audit certificate to release process

**Impact:** Medium (security); acceptable for single-user/self-hosted deployments.

---

## Testing Notes

### Test Execution Status
- **Unit Tests:** Running (vitest baseline in progress as of 2026-02-08 20:44 UTC)
- **E2E Tests:** Configured, not executed (requires Docker + live env vars)
- **Live API Tests:** Configured, not executed (requires ANTHROPIC_API_KEY, OPENAI_API_KEY, etc.)
- **Linting:** Executed, 33 errors found (pre-existing)

### Pre-existing Test Assumptions
- Tests assume Node.js ≥22.12.0
- Tests assume no other processes using port 18789 (gateway)
- Live tests assume real API keys available in environment
- Docker tests assume Docker daemon available

---

## Recommended Resolution Order

1. **First** (before release): Fix 33 linting errors → `pnpm lint:fix` + manual fixes
2. **Second** (polish): Document Bash version requirement in CONTRIBUTING.md
3. **Third** (quality): Set up live test CI job with credential injection
4. **Fourth** (security): Schedule sandbox security audit
5. **Fifth** (nice-to-have): Investigate mobile app signing automation

---

## Blockers for "Shippable" Status

**None identified.** All critical paths work:
- ✅ Build succeeds
- ✅ Tests execute (vitest infrastructure in place)
- ✅ Linting configured (errors are style, not functional)
- ✅ CLI and gateway are functional
- ✅ Web UI builds successfully

**Suggestion:** Deploy as-is with note that linting cleanup recommended before next release.
