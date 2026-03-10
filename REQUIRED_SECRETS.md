# Required Secrets

Every credential the system needs, grouped by integration.

## 1. Database (PostgreSQL)

| Variable | Required | Purpose |
|----------|----------|---------|
| `DB_HOST` | Yes (default: localhost) | PostgreSQL host |
| `DB_PORT` | Yes (default: 5432) | PostgreSQL port |
| `DB_NAME` | Yes (default: saudi_dropshipping) | Database name |
| `DB_USER` | Yes (default: postgres) | Database user |
| `DB_PASSWORD` | **YES** | Database password — app runs in DB-less mode without it |
| `DB_SSL` | No (default: false) | Enable SSL for cloud-hosted DBs |
| `DATABASE_URL` | Alternative | Full connection string — overrides split DB_* vars |

**Without DB:** discover-live, commerce, and listing_pack still work. Product persistence, scoring DB writes, dashboard, and marketing DB writes will fail gracefully.

## 2. Admin Authentication

| Variable | Required | Purpose |
|----------|----------|---------|
| `ADMIN_API_KEY` | **YES** | API key for all authenticated endpoints. Default: `changeme` |
| `JWT_SECRET` | **YES** | JWT signing secret. Default: `changeme` |

**CRITICAL:** Change both from defaults before deploying to production.

## 3. Salla Merchant API

| Variable | Required | Purpose |
|----------|----------|---------|
| `SALLA_CLIENT_ID` | **YES** | OAuth client ID from salla.partners |
| `SALLA_CLIENT_SECRET` | **YES** | OAuth client secret |
| `SALLA_REDIRECT_URI` | No (default provided) | OAuth callback URL |
| `SALLA_ACCESS_TOKEN` | **YES** | Obtained after completing OAuth flow |
| `SALLA_REFRESH_TOKEN` | Recommended | For automatic token refresh |
| `SALLA_STORE_ID` | Optional | Your Salla store ID |

**Without Salla:** All endpoints return "Salla not configured". Push-to-store disabled.

**Setup steps:**
1. Register at https://salla.partners/
2. Create an app, get client_id and client_secret
3. Set SALLA_CLIENT_ID and SALLA_CLIENT_SECRET
4. Visit `GET /api/v1/salla/status` to get the OAuth URL
5. Complete OAuth flow to receive access_token and refresh_token
6. Save tokens to .env

## 4. LLM (Content Generation)

| Variable | Required | Purpose |
|----------|----------|---------|
| `OPENAI_API_KEY` | Optional | OpenAI API key for AI content generation |
| `OPENAI_MODEL` | No (default: gpt-4o) | Model to use |
| `ANTHROPIC_API_KEY` | Optional | Alternative to OpenAI |
| `LLM_PROVIDER` | No (default: openai) | `openai` or `anthropic` |

**Without LLM keys:** System uses deterministic fallback templates for Arabic content, commerce packages, and marketing assets. Quality is good but not AI-personalized.

## 5. Supplier APIs

| Variable | Required | Purpose |
|----------|----------|---------|
| `ALIEXPRESS_APP_KEY` | Optional | Official AliExpress API |
| `ALIEXPRESS_APP_SECRET` | Optional | Official AliExpress API |
| `ALIEXPRESS_ACCESS_TOKEN` | Optional | Official AliExpress API |
| `ALIBABA_APP_KEY` | Optional | Official Alibaba API |
| `ALIBABA_APP_SECRET` | Optional | Official Alibaba API |
| `RAPIDAPI_KEY` | Optional | RapidAPI for live AliExpress search |
| `RAPIDAPI_HOST` | No (default provided) | RapidAPI host |

**Without supplier APIs:** Discovery uses mock product pools. Results are consistent but not live market data.

**Priority order for AliExpress discovery:**
1. Official API (ALIEXPRESS_APP_KEY) — not yet wired
2. RapidAPI (RAPIDAPI_KEY) — fully working
3. Mock fallback pool — always available

## 6. n8n Automation

| Variable | Required | Purpose |
|----------|----------|---------|
| `N8N_WEBHOOK_URL` | Optional | n8n webhook endpoint |
| `N8N_API_KEY` | Optional | n8n API key |

**Without n8n:** Webhook integration inactive. All other features work normally.

## Summary: What Runs Without Any Secrets

| Feature | Works? | Notes |
|---------|--------|-------|
| Server startup | Yes | Starts on PORT with health check |
| discover-live | Yes | Uses mock product pools |
| Commerce package | Yes | Deterministic templates |
| Listing pack | Yes | Deterministic templates |
| Health check | Yes | Shows integration status |
| DB persistence | No | Needs DB_PASSWORD |
| Dashboard/rankings | No | Needs DB |
| Salla push | No | Needs Salla OAuth |
| AI content | Fallback | Needs OPENAI_API_KEY |
| Live AliExpress | No | Needs RAPIDAPI_KEY |
