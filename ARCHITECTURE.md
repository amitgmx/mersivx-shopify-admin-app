# Mersivx 3D Builder - Shopify Admin App Architecture

## Table of Contents
1. [System Overview](#system-overview)
2. [Architecture Diagram](#architecture-diagram)
3. [Database Schema](#database-schema)
4. [Authentication & Sessions](#authentication--sessions)
5. [API Endpoints](#api-endpoints)
6. [Frontend Application](#frontend-application)
7. [Integration Options](#integration-options)
8. [Data Flow](#data-flow)
9. [Security Model](#security-model)
10. [File Structure](#file-structure)

---

## System Overview

The Mersivx 3D Builder Shopify Admin App is a React Router v7 application that integrates with Shopify stores to provide a 3D store building experience. The app manages merchant credentials, provides two integration options (iframe and external page), and implements a freemium payment model.

**Tech Stack:**
- **Frontend**: React Router v7 (SSR), Shopify Polaris Web Components
- **Backend**: Node.js with React Router server-side
- **Database**: MongoDB with Prisma ORM
- **Authentication**: Shopify OAuth with online sessions
- **Hosting**: Embedded in Shopify Admin

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Shopify Admin                             │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │              Mersivx Admin App (Embedded)                  │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │  Frontend (React Router v7 + Polaris)               │  │  │
│  │  │  • Payment Mode Selection (Freemium/Premium)        │  │  │
│  │  │  • Email Configuration                              │  │  │
│  │  │  • Launch Builder (External Tab)                    │  │  │
│  │  │  • Embedded iframe Preview                          │  │  │
│  │  └──────────────────┬──────────────────────────────────┘  │  │
│  │                     │ API Calls                            │  │
│  │  ┌──────────────────▼──────────────────────────────────┐  │  │
│  │  │  Backend (React Router Server + Shopify SDK)        │  │  │
│  │  │  • Loader Functions (SSR)                           │  │  │
│  │  │  • API Routes                                       │  │  │
│  │  │  • Authentication Middleware                        │  │  │
│  │  └──────────────────┬──────────────────────────────────┘  │  │
│  └────────────────────│─────────────────────────────────────┘  │
└────────────────────────│────────────────────────────────────────┘
                         │
            ┌────────────▼─────────────┐
            │   MongoDB Database       │
            │   • Session (auth)       │
            │   • MerchantConfig       │
            │   • OneTimeTicket        │
            └────────────┬─────────────┘
                         │
                         │ Credentials & Config
                         │
            ┌────────────▼─────────────┐
            │  Mersivx Builder System  │
            │  (www.mersivx.com)       │
            │  • Iframe Mode           │
            │  • External Page Mode    │
            └──────────────────────────┘
```

---

## Database Schema

### MongoDB Database: `General`

#### 1. **Session Model** (Shopify Authentication)
```prisma
model Session {
  id                  String    @id @map("_id")
  shop                String
  state               String
  isOnline            Boolean   @default(false)
  scope               String?
  expires             DateTime?
  accessToken         String
  userId              BigInt?
  firstName           String?
  lastName            String?
  email               String?    // From online session
  accountOwner        Boolean   @default(false)
  locale              String?
  collaborator        Boolean?  @default(false)
  emailVerified       Boolean?  @default(false)
  refreshToken        String?
  refreshTokenExpires DateTime?
}
```

**Purpose**: Stores Shopify OAuth sessions with user information
**Key Fields**:
- `id`: Session identifier from Shopify
- `shop`: Store domain (e.g., "mystore.myshopify.com")
- `accessToken`: OAuth access token for API calls
- `email`: User's email (from online sessions)
- `isOnline`: Whether this is an online session (has user info)

---

#### 2. **MerchantConfig Model** (Merchant Credentials & Settings)
```prisma
model MerchantConfig {
  id          String   @id @default(auto()) @map("_id") @db.ObjectId
  shop        String   @unique
  accessToken String   // OAuth access token
  apiKey      String   // Shopify API key
  email       String?  // User's email for notifications
  accessKey   String?  @unique // Persistent key for builder access
  paymentMode String   @default("freemium") // freemium, premium
  builderData Json?    // 3D scene settings, banner config
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

**Purpose**: Stores merchant credentials and builder configuration
**Key Fields**:
- `shop`: Unique store identifier
- `accessToken`: OAuth token for Shopify API access
- `apiKey`: Shopify App API key
- `accessKey`: Persistent UUID for builder authentication
- `paymentMode`: Billing tier (freemium/premium)
- `builderData`: JSON blob for 3D store configuration

**Lifecycle**:
1. Created when user clicks "Create 3D Store" or "Open Builder"
2. Updated when user changes email or payment mode
3. Deleted when app is uninstalled

---

#### 3. **OneTimeTicket Model** (Temporary Authentication)
```prisma
model OneTimeTicket {
  id        String   @id @default(auto()) @map("_id") @db.ObjectId
  ticket    String   @unique @default(uuid())
  shop      String
  used      Boolean  @default(false)
  expiresAt DateTime
  createdAt DateTime @default(now())

  @@index([expiresAt])
  @@index([shop])
}
```

**Purpose**: Short-lived tickets for external page authentication (if needed)
**Key Fields**:
- `ticket`: UUID for one-time use
- `used`: Prevents replay attacks
- `expiresAt`: 5-minute expiry window

**Note**: Currently not used in freemium implementation, kept for future external page mode

---

## Authentication & Sessions

### OAuth Flow

```
1. User installs app from Shopify Admin
   ↓
2. Shopify redirects to /auth/callback
   ↓
3. App exchanges authorization code for access token
   ↓
4. Session stored in MongoDB (online session with user email)
   ↓
5. afterAuth hook logs completion
   ↓
6. User redirected to app._index (main dashboard)
```

### Session Storage Implementation

**Custom MongoDB Session Storage** (`app/session-storage.server.ts`):
- Implements Shopify's `SessionStorage` interface
- Handles MongoDB's immutable `_id` field
- Extracts user email from `onlineAccessInfo`

**Key Methods**:
```typescript
storeSession(session: Session): Promise<boolean>
  - Upserts session to MongoDB
  - Extracts user email from onlineAccessInfo
  - Excludes `id` from update clause (MongoDB constraint)

loadSession(id: string): Promise<Session | undefined>
  - Loads session from MongoDB
  - Reconstructs onlineAccessInfo with user data

deleteSession(id: string): Promise<boolean>
  - Removes session on logout or expiry
```

### Online vs Offline Sessions

**Configuration** (`app/shopify.server.ts`):
```typescript
useOnlineTokens: true  // Enables user email extraction
```

**Why Online Sessions?**
- Access to user email, name, account owner status
- Required for pre-filling email field
- Short-lived tokens (better security for user info)

---

## API Endpoints

### 1. `/api/merchant/configure` (POST)
**Purpose**: Create or update merchant configuration

**Authentication**: Requires Shopify session (via `authenticate.admin()`)

**Request Body**:
```json
{
  "email": "merchant@example.com",
  "paymentMode": "freemium"
}
```

**Response**:
```json
{
  "accessKey": "uuid-string",
  "isNew": true  // false if updating existing
}
```

**Logic**:
```typescript
1. Authenticate request (get session)
2. Check if MerchantConfig exists for shop
3. IF EXISTS:
   - Update email and paymentMode
   - Generate accessKey if missing (legacy records)
   - Return existing accessKey
4. IF NEW:
   - Create MerchantConfig with:
     - shop, accessToken, apiKey (from session)
     - email, paymentMode (from request)
     - accessKey (generated UUID)
   - Return new accessKey
```

**File**: `app/routes/api.merchant.configure.tsx`

---

### 2. `/api/merchant/get-config` (POST)
**Purpose**: Builder retrieves merchant configuration using accessKey

**Authentication**: None (accessKey is the authentication)

**Request Body**:
```json
{
  "key": "uuid-access-key"
}
```

**Response**:
```json
{
  "shop": "mystore.myshopify.com",
  "accessToken": "shopify-oauth-token",
  "apiKey": "app-api-key",
  "email": "merchant@example.com",
  "paymentMode": "freemium",
  "builderData": { /* 3D scene config */ },
  "isNew": true  // false if builderData exists
}
```

**Security**:
- Rate limiting recommended (not implemented)
- IP logging for audit trail
- Invalid key attempts logged with IP

**File**: `app/routes/api.merchant.get-config.tsx`

---

## Frontend Application

### Main Dashboard (`app/routes/app._index.tsx`)

#### Loader Function (Server-Side Rendering)
```typescript
export const loader = async ({ request }: LoaderFunctionArgs) => {
  // 1. Authenticate request
  const { session } = await authenticate.admin(request);

  // 2. Query merchant config
  const merchantConfig = await prisma.merchantConfig.findUnique({
    where: { shop: session.shop },
  });

  // 3. Get user email from session
  const sessionData = await prisma.session.findUnique({
    where: { id: session.id },
    select: { email: true, isOnline: true },
  });

  // 4. Return data for client-side rendering
  return {
    shop: session.shop,
    userEmail: sessionData?.email || "",
    builderUrl: process.env.BUILDER_SYSTEM_URL,
    merchantConfig: merchantConfig ? {
      email: merchantConfig.email,
      paymentMode: merchantConfig.paymentMode,
      accessKey: merchantConfig.accessKey || null,
      createdAt: merchantConfig.createdAt.toISOString(),
    } : null,
  };
}
```

**What it does**:
1. Runs on server before page renders
2. Authenticates user via Shopify session
3. Loads existing merchant config (if any)
4. Pre-fills user email from session
5. Returns data to React component

---

#### React Component Structure

**State Management**:
```typescript
const [email, setEmail] = useState(merchantConfig?.email || userEmail);
const [paymentMode, setPaymentMode] = useState(merchantConfig?.paymentMode || "freemium");
const [isProcessing, setIsProcessing] = useState(false);
const [iframeLoaded, setIframeLoaded] = useState(false);
const [iframeUrl, setIframeUrl] = useState<string>("");
```

**Key Logic**:
```typescript
const isExistingStore = !!merchantConfig;  // Has config been created?
```

---

#### UI Sections

**1. Payment Mode Selection**
```jsx
<s-section heading="Choose Your Plan">
  <s-button variant={paymentMode === "freemium" ? "primary" : "secondary"}>
    Freemium (Free)
  </s-button>
  <s-button variant={paymentMode === "premium" ? "primary" : "secondary"} disabled>
    Premium (Coming Soon)
  </s-button>
</s-section>
```

**2. Email Configuration**
```jsx
<s-section heading="Contact Email">
  <input
    type="email"
    value={email}
    onChange={(e) => setEmail(e.target.value)}
    placeholder="your@email.com"
  />
</s-section>
```

**3. Store Status** (Existing stores only)
```jsx
{isExistingStore && (
  <s-banner tone="success">
    Store Created: {new Date(merchantConfig.createdAt).toLocaleDateString()}
  </s-banner>
)}
```

**4. Launch Builder Button**
```jsx
<s-button
  onClick={runBuilder}
  variant="primary"
  disabled={!email || isProcessing}
>
  {isExistingStore ? "Open in New Tab" : "Create 3D Store"}
</s-button>
```

**5. Embedded iframe Preview** (Existing stores with accessKey)
```jsx
{isExistingStore && iframeUrl && (
  <iframe
    src={iframeUrl}
    style={{ width: "100%", height: "600px" }}
    title="Mersivx Builder Preview"
  />
)}
```

---

#### `runBuilder()` Function

```typescript
const runBuilder = async () => {
  setIsProcessing(true);

  try {
    // 1. Call configure API
    const response = await fetch("/api/merchant/configure", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, paymentMode }),
    });

    const { accessKey } = await response.json();

    // 2. Open builder in new tab with accessKey
    const builderUrlWithKey = `${builderUrl}?key=${accessKey}&mode=${paymentMode}`;
    window.open(builderUrlWithKey, "_blank");

    shopify.toast.show("Opening Builder...");
  } catch (error) {
    shopify.toast.show("Failed to launch builder", { isError: true });
  } finally {
    setIsProcessing(false);
  }
};
```

**What happens**:
1. User clicks "Create 3D Store" or "Open in New Tab"
2. API creates/updates MerchantConfig
3. Returns accessKey (persistent UUID)
4. Opens builder URL: `https://mersivx.com?key=<uuid>&mode=freemium`
5. Builder calls `/api/merchant/get-config` with key to retrieve credentials

---

#### iframe Loading Logic

```typescript
useEffect(() => {
  if (merchantConfig?.accessKey) {
    setIframeUrl(`${builderUrl}?key=${merchantConfig.accessKey}`);
  }
}, [builderUrl, merchantConfig]);
```

**Flow**:
1. Component mounts or merchantConfig changes
2. If accessKey exists, set iframe URL
3. iframe loads Mersivx builder with accessKey
4. Builder fetches credentials via API
5. `onLoad` callback sets `iframeLoaded = true`

---

## Integration Options

### Option 1: External Page (New Tab)

**User Flow**:
```
1. User clicks "Open in New Tab"
   ↓
2. runBuilder() creates/updates MerchantConfig
   ↓
3. Opens https://mersivx.com?key=<accessKey>&mode=<paymentMode>
   ↓
4. Builder extracts accessKey from URL
   ↓
5. Builder calls /api/merchant/get-config with accessKey
   ↓
6. Receives shop, accessToken, apiKey, builderData
   ↓
7. Builder initializes with merchant's Shopify store
```

**Pros**:
- Full screen experience
- No iframe restrictions (cookies, local storage)
- Can use browser features (downloads, camera, etc.)
- Independent navigation

**Cons**:
- User leaves Shopify Admin context
- Requires tab switching
- Credentials in URL (mitigated by persistent accessKey)

---

### Option 2: Embedded iframe

**User Flow**:
```
1. User lands on dashboard with existing MerchantConfig
   ↓
2. useEffect sets iframe URL with accessKey
   ↓
3. iframe loads https://mersivx.com?key=<accessKey>
   ↓
4. Builder calls /api/merchant/get-config
   ↓
5. Receives credentials and initializes
   ↓
6. User interacts with builder within Shopify Admin
```

**Pros**:
- Seamless integration within Shopify
- No context switching
- Consistent admin UI
- App Bridge features available

**Cons**:
- iframe restrictions (cookies, storage, dimensions)
- Performance overhead
- Cross-origin limitations
- Smaller viewport

---

### Builder Integration Code

**What the Builder System needs to implement**:

```javascript
// In Mersivx Builder (mersivx.com)

// 1. Extract accessKey from URL
const urlParams = new URLSearchParams(window.location.search);
const accessKey = urlParams.get('key');
const paymentMode = urlParams.get('mode');

// 2. Fetch merchant configuration
async function initializeBuilder() {
  try {
    const response = await fetch('https://your-app-url.com/api/merchant/get-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: accessKey }),
    });

    const config = await response.json();

    // 3. Initialize with merchant's credentials
    const {
      shop,           // "mystore.myshopify.com"
      accessToken,    // OAuth token for Shopify API
      apiKey,         // App API key
      email,          // Merchant email
      paymentMode,    // "freemium" or "premium"
      builderData,    // Saved 3D scene config (or null)
      isNew,          // true if no builderData exists
    } = config;

    // 4. Load 3D scene
    if (isNew) {
      // Show onboarding for new store
      showOnboarding();
    } else {
      // Load existing configuration
      load3DScene(builderData);
    }

    // 5. Use Shopify credentials for API calls
    fetchProducts(shop, accessToken, apiKey);

  } catch (error) {
    console.error('Failed to initialize builder:', error);
    showError('Authentication failed');
  }
}

// 6. Example: Fetch products from Shopify
async function fetchProducts(shop, accessToken, apiKey) {
  const response = await fetch(`https://${shop}/admin/api/2025-01/products.json`, {
    headers: {
      'X-Shopify-Access-Token': accessToken,
    },
  });

  const data = await response.json();
  return data.products;
}

// 7. Save builder configuration back to app
async function saveBuilderData(sceneConfig) {
  // POST to your own API that updates MerchantConfig.builderData
  await fetch('https://your-backend/api/save-config', {
    method: 'POST',
    body: JSON.stringify({
      accessKey,
      builderData: sceneConfig,
    }),
  });
}
```

---

## Data Flow

### First-Time User Journey

```
1. User installs app
   → OAuth flow creates Session in MongoDB
   → User redirected to dashboard
   → Loader runs: No MerchantConfig found
   → UI shows: Payment selection, Email field, "Create 3D Store" button

2. User selects Freemium, enters email, clicks "Create 3D Store"
   → POST /api/merchant/configure
   → Creates MerchantConfig with:
      - shop, accessToken, apiKey (from session)
      - email, paymentMode (from user input)
      - accessKey (generated UUID)
   → Returns accessKey
   → Opens https://mersivx.com?key=<uuid>&mode=freemium

3. Builder extracts accessKey, calls /api/merchant/get-config
   → Receives shop, accessToken, apiKey, email, paymentMode
   → isNew = true (no builderData)
   → Shows onboarding flow

4. User builds 3D store, saves configuration
   → Builder POSTs to its own backend
   → Backend updates MerchantConfig.builderData

5. User returns to Shopify app
   → Loader runs: MerchantConfig exists
   → UI shows: "Store Created" banner, "Open in New Tab", iframe preview
   → iframe loads with accessKey
   → Builder loads saved builderData
```

---

### Returning User Journey

```
1. User opens app in Shopify Admin
   → Loader runs: MerchantConfig exists
   → Pre-fills email and paymentMode
   → Sets iframeUrl with accessKey

2. UI displays:
   - Payment mode (can be changed)
   - Email (can be edited)
   - "Store Created: [date]" banner
   - "Open in New Tab" button
   - iframe with builder loaded

3. User clicks "Open in New Tab"
   → Updates email/paymentMode if changed
   → Opens builder in new tab
   → Builder loads existing configuration

4. User edits in iframe
   → Changes saved to MerchantConfig.builderData
   → Persists across sessions
```

---

## Security Model

### 1. **OAuth Token Security**
- Tokens stored in MongoDB, never exposed to client
- Online sessions include user email (short-lived)
- Offline tokens for API access (long-lived)

### 2. **Access Key System**
- Persistent UUID per merchant
- Never changes (unlike one-time tickets)
- Used for builder authentication
- Logged with IP on each access

### 3. **API Authentication**
- `/api/merchant/configure`: Requires Shopify session
- `/api/merchant/get-config`: accessKey is the credential

### 4. **Data Isolation**
- Each shop has unique MerchantConfig
- `shop` field is unique indexed
- No cross-shop data leakage

### 5. **Credential Handling**
```typescript
// ❌ NEVER expose in frontend
session.accessToken
process.env.SHOPIFY_API_KEY

// ✅ Only in backend APIs
await authenticate.admin(request)  // Server-only
prisma.merchantConfig.findUnique() // Server-only

// ✅ Safe for client
accessKey  // UUID, not sensitive
shop       // Public domain
email      // User's own email
```

### 6. **Cleanup on Uninstall**
```typescript
// app/routes/webhooks.app.uninstalled.tsx
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = await authenticate.webhook(request);

  // Delete all merchant data
  await prisma.merchantConfig.delete({ where: { shop } });
  await prisma.oneTimeTicket.deleteMany({ where: { shop } });
};
```

---

## File Structure

```
mersivx-builder-app/
├── app/
│   ├── routes/
│   │   ├── app._index.tsx              # Main dashboard UI + loader
│   │   ├── api.merchant.configure.tsx  # Create/update merchant config
│   │   ├── api.merchant.get-config.tsx # Builder retrieves config
│   │   └── webhooks.app.uninstalled.tsx # Cleanup on uninstall
│   │
│   ├── shopify.server.ts               # Shopify app configuration
│   ├── session-storage.server.ts       # Custom MongoDB session storage
│   └── db.server.ts                    # Prisma client singleton
│
├── prisma/
│   └── schema.prisma                   # Database models
│
├── .env                                # Environment variables
├── shopify.app.toml                    # Shopify CLI configuration
└── ARCHITECTURE.md                     # This file
```

---

## Environment Variables

```bash
# Shopify App Credentials
SHOPIFY_API_KEY=your-api-key
SHOPIFY_API_SECRET=your-api-secret
SHOPIFY_APP_URL=https://your-app-url.com
SCOPES=read_products,read_orders,read_discounts

# Database
DATABASE_URL=mongodb+srv://user:pass@cluster.mongodb.net/General

# Builder System
BUILDER_SYSTEM_URL=https://www.mersivx.com

# Optional
SHOP_CUSTOM_DOMAIN=custom-domain.com
```

---

## Key Features

### ✅ Implemented
- Shopify OAuth with online sessions
- MongoDB session storage with Prisma
- Merchant configuration management
- Persistent access key authentication
- Freemium/Premium payment mode selection
- Email management
- Dual integration: iframe + external page
- User email pre-filling from session
- Store status tracking
- Automatic credential sync
- Uninstall webhook cleanup

### 🚧 Pending
- Premium payment processing (Shopify Billing API)
- Rate limiting on `/api/merchant/get-config`
- Builder data save endpoint
- Error monitoring and logging
- Session expiry handling
- Access key rotation (if needed)
- Admin dashboard for viewing all merchants

---

## Development Commands

```bash
# Install dependencies
npm install

# Generate Prisma Client
npx prisma generate

# Push schema to MongoDB (no migrations)
npx prisma db push

# Start dev server
npm run dev

# Open Prisma Studio (database GUI)
npx prisma studio

# Deploy to Shopify
npm run deploy
```

---

## Production Considerations

1. **Security**
   - Implement rate limiting on public APIs
   - Add request validation middleware
   - Encrypt accessToken in MerchantConfig
   - Set up CORS policies

2. **Performance**
   - Cache session lookups
   - Add database indexes for common queries
   - Implement CDN for static assets
   - Optimize iframe loading

3. **Monitoring**
   - Add error tracking (Sentry, etc.)
   - Log API access patterns
   - Monitor database performance
   - Track conversion rates (freemium → premium)

4. **Scalability**
   - Connection pooling for MongoDB
   - Horizontal scaling with load balancer
   - Session store optimization
   - CDN for builder assets

---

## Support & Troubleshooting

### Common Issues

**Email not loading:**
- Ensure `useOnlineTokens: true` in shopify.server.ts
- Re-authenticate app after changing session config
- Check console logs for session debug info

**iframe not loading:**
- Verify BUILDER_SYSTEM_URL in .env
- Check CORS headers on builder system
- Ensure accessKey exists in MerchantConfig

**TypeScript errors:**
- Run `npx prisma generate` after schema changes
- Restart TypeScript server in VSCode
- Clear `.react-router` and `.vite` cache

**Database errors:**
- MongoDB doesn't support migrations, use `npx prisma db push`
- Check DATABASE_URL connection string
- Verify MongoDB IP whitelist includes your IP

---

## Changelog

**v1.0.0** - Initial Implementation
- Shopify OAuth integration
- MongoDB + Prisma setup
- Merchant configuration management
- Dual integration options
- Freemium mode implementation
- Online sessions for user email

---

*Last Updated: 2026-02-17*
*Architecture Version: 1.0*
