---
Task ID: 1
Agent: Super Z (main)
Task: Security audit continuation — fix remaining vulnerabilities and bugs

Work Log:
- Analyzed full codebase state from previous session (files didn't persist)
- Identified actual remaining gaps (codebase was more mature than initial audit assumed)
- Created `src/lib/errors.ts` — centralized API error handling (Prisma error mapping, safe 500s)
- Updated `src/lib/auth.ts` — added `rateLimit()` and `getClientId()` functions; made JWT_SECRET throw in production instead of just logging
- Created `src/middleware.ts` — Next.js middleware for security headers (X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, Referrer-Policy, Permissions-Policy, removes X-Powered-By)
- Fixed `PATCH /api/users/me` — sanitized displayName, avatar (URL validation), bio inputs
- Fixed `PATCH /api/services/[id]` — sanitized title, description; validated category enum, price bounds, deliveryDays integer range
- Fixed `PATCH /api/subscriptions/tiers/[id]` — sanitized name, benefits (array validation + per-item sanitize); validated price > 0
- Fixed TOCTOU race condition in `POST /api/subscriptions/subscribe` — moved balance check inside `$transaction`
- Added rate limiting to: gifts (30/min), deposit (5/min), withdraw (3/min), subscribe (5/min), register (5/min IP), login (10/15min email + 20/15min IP)
- Fixed `POST /api/economy/withdraw` — now requires linked wallet address; added minimum withdrawal amount
- Fixed WebSocket server — replaced all `io.emit()` user-targeted events with `io.to('user:${userId}')` room-based delivery (O(1) instead of O(n)); auto-join users to personal room on connection
- Updated frontend components (DMView, PKChallengePanel, PKBattleArena) to match new WS event names
- Refactored login route to use centralized `rateLimit()` instead of custom implementation
- Verified all modified backend files compile cleanly with TypeScript

Stage Summary:
- 12 security vulnerabilities and bugs fixed
- New infrastructure: rate limiter, error handler, security middleware
- WebSocket performance improved (room-based targeting instead of global broadcast)
- All financial endpoints now have rate limiting and transaction-level balance checks
- No new TypeScript compilation errors introduced
