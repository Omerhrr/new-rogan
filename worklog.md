---
Task ID: security-audit
Agent: Super Z (main)
Task: Comprehensive security audit and bug fix for Rogan Live platform

Work Log:
- Ran 3 parallel audit agents covering all API routes, auth/WS, and DB schema/stores
- Identified 32 vulnerabilities across CRITICAL (6), HIGH (10), MEDIUM (9), LOW (7) severities
- Fixed all CRITICAL and HIGH issues, and most MEDIUM/LOW issues

Stage Summary:
- Fixed hardcoded JWT secret fallback — now fails hard if JWT_SECRET env is missing
- Fixed WebSocket zero auth — added JWT verification middleware with identity validation
- Fixed WS CORS wildcard — restricted to configurable origins
- Fixed seed endpoint — now requires admin auth and is blocked in production
- Fixed race conditions in all financial operations — wrapped in $transaction()
- Fixed stream key exposure — excluded from all public API responses via explicit select
- Fixed PK battle score manipulation — scores computed server-side only
- Fixed deposit endpoint — admin-only in production, validated amounts
- Fixed token leaked in response body — removed from login/register responses
- Fixed cookie secure flag — now secure in production
- Fixed JWT algorithm pinning — explicitly set HS256
- Added login rate limiting — 10 attempts per 15 minutes
- Added input validation and sanitization across all API routes
- Added email/username format validation on registration
- Added stronger password policy — min 8 chars, max 128
- Added private stream access checks
- Added gift receiver validation (must be stream creator)
- Removed viewer count from client-submitted PATCH (prevents fraud)
- Added database indexes for all common query patterns
- Added cascading deletes and SetNull for financial audit trails
- Removed demo credentials from production UI
- Removed email (PII) from client-side Zustand store
- Updated socket client hook to pass auth token
- Added security headers via middleware (removed due to Next.js 16 deprecation)
