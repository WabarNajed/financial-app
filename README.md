# Saudi Dropshipping AI Agent

AI-powered dropshipping operating system for the Saudi market. Discovers trending products, finds suppliers, compares local prices, calculates margins, generates Arabic content, and pushes to Salla.

## Architecture

```
src/
├── config/              # Environment validation, pricing & scoring config
├── database/            # PostgreSQL schema, migrations, repositories
├── engines/
│   ├── discovery/       # Product discovery from Google Trends, Amazon.sa, Noon, TikTok
│   ├── supplier/        # Supplier matching via AliExpress, Alibaba
│   ├── market/          # Saudi market price comparison (Amazon.sa, Noon)
│   ├── pricing/         # Landed cost, margin, ad spend calculations
│   └── scoring/         # Weighted product scoring (0-100)
├── integrations/
│   ├── salla/           # Salla Merchant API (create/update/publish products)
│   └── content/         # Arabic content generation via LLM
├── api/                 # Express REST API with admin auth
├── services/            # Orchestrator, approval workflow
├── marketing/           # Marketing asset preparation for Meta/TikTok/Snapchat
├── adapters/            # Pluggable source & supplier adapters
├── types/               # Shared TypeScript interfaces
└── utils/               # Logger, retry, rate-limited HTTP client
```

## Data Flow

```
Discovery Sources → Product DB → Supplier Matching → Market Comparison
     → Pricing Engine → Scoring → Admin Review → Arabic Content → Salla Push
                                                              → Marketing Queue
```

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL 14+
- (Optional) Docker & Docker Compose
- (Optional) n8n for workflow automation

### Local Development

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your database credentials and API keys

# 3. Create database
createdb saudi_dropshipping

# 4. Run migrations
npm run migrate

# 5. Start development server
npm run dev
```

The API starts at `http://localhost:3000`. Health check: `GET /health`.

### Docker Setup

```bash
# Start all services (API + PostgreSQL + n8n)
docker compose up -d

# Run migrations
docker compose exec api npm run migrate

# View logs
docker compose logs -f api
```

## API Endpoints

All endpoints require `X-API-Key` header (set via `ADMIN_API_KEY` in `.env`).

### Products

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/v1/products | List products (query: status, search, limit, offset) |
| GET | /api/v1/products/:id | Get product with all related data |
| POST | /api/v1/products/discover | Run product discovery |
| POST | /api/v1/products/pipeline | Run full analysis pipeline |
| POST | /api/v1/products/:id/analyze | Analyze a specific product |
| POST | /api/v1/products/:id/content | Generate Arabic content |
| POST | /api/v1/products/:id/marketing | Prepare marketing assets |
| POST | /api/v1/products/:id/approve | Approve product for Salla push |
| POST | /api/v1/products/:id/reject | Reject product |
| POST | /api/v1/products/:id/push-to-salla | Push approved product to Salla |
| GET | /api/v1/products/review/pending | Get products awaiting review |

### Dashboard

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/v1/dashboard/stats | Summary statistics |
| GET | /api/v1/dashboard/rankings | Products ranked by score |

### Workflows

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/v1/workflows | Recent workflow runs |
| POST | /api/v1/workflows/run | Trigger full pipeline |
| POST | /api/v1/workflows/analyze-pending | Analyze all discovered products |

### Salla

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/v1/salla/status | Check Salla connection |
| GET | /api/v1/salla/callback | OAuth callback |
| GET | /api/v1/salla/products | List products from Salla store |
| POST | /api/v1/salla/refresh-token | Refresh access token |

### Marketing

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/v1/marketing/queue | Get queued assets (query: platform) |
| GET | /api/v1/marketing/product/:id | Get assets for a product |
| POST | /api/v1/marketing/:id/sent | Mark asset as sent |

## Required Accounts & Credentials

### Required

| Service | Purpose | How to Get |
|---------|---------|------------|
| PostgreSQL | Data storage | Local install or hosted (Supabase, RDS) |

### Recommended

| Service | Purpose | How to Get |
|---------|---------|------------|
| Salla | Store integration | Register as a partner at salla.partners |
| OpenAI | Arabic content generation | Get API key at platform.openai.com |

### Optional

| Service | Purpose | How to Get |
|---------|---------|------------|
| AliExpress API | Better supplier data | Register at AliExpress affiliate portal |
| Alibaba API | Bulk supplier data | Register at Alibaba open platform |
| n8n | Workflow automation | Self-hosted or n8n.cloud |

## Connecting Salla

1. Register at salla.partners
2. Create an app and get Client ID + Secret
3. Set `SALLA_CLIENT_ID` and `SALLA_CLIENT_SECRET` in `.env`
4. Visit `GET /api/v1/salla/status` to get the OAuth URL
5. Complete OAuth flow - save the returned tokens to `.env`
6. Products can now be pushed to your Salla store

## Product Workflow

1. **Discovery** - Products collected from Google Trends, Amazon.sa, Noon, TikTok signals
2. **Supplier Matching** - Searched on AliExpress and Alibaba
3. **Market Comparison** - Local Saudi prices checked on Amazon.sa and Noon
4. **Pricing** - Landed cost, margins, ad spend ceilings calculated
5. **Scoring** - Products scored 0-100 based on weighted criteria
6. **Review** - Admin reviews analyzed products (approve/reject)
7. **Content** - Arabic product content generated via LLM
8. **Push** - Approved products pushed to Salla store
9. **Marketing** - Ad copy prepared for Meta, TikTok, Snapchat, Instagram

## Scoring Weights

Default weights (configurable):

| Factor | Weight | Description |
|--------|--------|-------------|
| Trend | 20% | Trend signal strength |
| Demand | 20% | Local market demand indicators |
| Margin | 15% | Profit margin quality |
| Virality | 15% | Social media viral potential |
| Shipping | 10% | Shipping speed and simplicity |
| Competition | 10% | Local competition level |
| Supplier Trust | 10% | Supplier reliability score |

## n8n Workflows

Import workflow JSON files from the `n8n/` directory:

- **daily-product-discovery.json** - Runs daily at 8 AM, discovers and analyzes products
- **pricing-analysis.json** - Runs daily at 10 AM, analyzes pending products
- **approval-and-push.json** - Webhook-triggered approval, content generation, and Salla push

## Deployment

### VPS Deployment

```bash
# 1. Clone and setup
git clone <repo-url> && cd saudi-dropshipping-agent
cp .env.example .env
# Edit .env with your credentials

# 2. Start with Docker
docker compose up -d

# 3. Run migrations
docker compose exec api npm run migrate

# 4. Verify
curl http://localhost:3000/health
```

### Security Recommendations

- Change `ADMIN_API_KEY` and `JWT_SECRET` to strong random values
- Use HTTPS in production (nginx reverse proxy recommended)
- Restrict database access to application containers only
- Rotate Salla tokens periodically
- Set `NODE_ENV=production` in production
- Use rate limiting (configured by default)
- Do not expose n8n publicly without authentication

## Limitations & Risks

- **Web scraping** - Amazon.sa, Noon, and AliExpress adapters use scraping which may break if sites change. Abstracted behind adapter pattern for easy replacement.
- **TikTok trends** - Semi-automated (curated keyword list). No official API available. Update keywords periodically.
- **Google Trends** - Unofficial API, rate-limited. May require proxy for production scale.
- **LLM content** - Requires OpenAI API key. Without it, placeholder content is generated.
- **Salla image upload** - Image pipeline works via URL; some image formats may not be supported.
- **Exchange rate** - USD to SAR rate is hardcoded (configurable). Consider using a live rate API for production.

## Configuration

### Pricing Rules

Edit `src/config/index.ts` or override programmatically:

```typescript
{
  target_margin_pct: 35,      // Target gross margin
  minimum_margin_pct: 20,     // Minimum acceptable margin
  vat_rate: 0.15,             // Saudi VAT (15%)
  vat_enabled: true,
  platform_fee_pct: 2.5,     // Salla/payment processing fees
  default_shipping_sar: 25,   // Default shipping cost to Saudi
  usd_to_sar_rate: 3.75,     // USD to SAR exchange rate
  ad_spend_safety_factor: 0.6 // Safe ad spend as % of gross profit
}
```

## License

Private / Proprietary
