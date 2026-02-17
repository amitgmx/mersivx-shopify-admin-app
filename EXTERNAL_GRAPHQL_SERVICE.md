# External GraphQL Service Requirements

This Shopify app separates session storage from business data for maximum security.

## Shopify App Architecture

The Shopify app uses:
- **MongoDB (Prisma)** for session storage only (isolated, no business data)
- **Your External GraphQL service** for all business data (merchants, tickets, credentials)

Set these environment variables in `.env`:
```env
GRAPHQL_API_URL=https://your-graphql-service.com/graphql
DATABASE_URL="mongodb+srv://..."  # ONLY for sessions
```

**Result:** Business data (MerchantConfig, OneTimeTicket) is completely isolated in your external service!

## Required GraphQL Schema

Your external GraphQL service must implement the following schema:

### Types

```graphql
type MerchantConfig {
  id: ID!
  shop: String!
  accessToken: String!
  apiKey: String!
  builderData: JSON
  createdAt: String!
  updatedAt: String!
}

type OneTimeTicket {
  id: ID!
  ticket: String!
  shop: String!
  used: Boolean!
  expiresAt: String!
  createdAt: String!
}

type AuthPayload {
  shop: String!
  accessToken: String!
  apiKey: String!
  builderData: JSON
}

type TicketPayload {
  ticket: String!
}

scalar JSON
```

### Required Mutations

```graphql
type Mutation {
  # Called by Shopify afterAuth hook
  syncMerchantCredentials(
    shop: String!
    accessToken: String!
    apiKey: String!
  ): MerchantConfig!

  # Called by Shopify app to create tickets
  createTicket(shop: String!): TicketPayload!

  # Called by external builder to exchange tickets
  exchangeTicket(ticket: String!): AuthPayload!

  # Called by external builder to update builder data
  updateBuilderData(shop: String!, builderData: JSON!): MerchantConfig!

  # Called by uninstall webhook
  deleteMerchantData(shop: String!): Boolean!
}
```

### Required Queries (Optional but recommended)

```graphql
type Query {
  merchantConfig(shop: String!): MerchantConfig
  validateTicket(ticket: String!): Boolean!
}
```

## Database Models (Your Service Should Implement)

### MerchantConfig
```prisma
model MerchantConfig {
  id          String   @id @default(auto()) @map("_id") @db.ObjectId
  shop        String   @unique
  accessToken String   // OAuth access token
  apiKey      String   // Shopify API key
  builderData Json?    // Store 3D scene settings, banner config, etc.
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([shop])
}
```

### OneTimeTicket
```prisma
model OneTimeTicket {
  id        String   @id @default(auto()) @map("_id") @db.ObjectId
  ticket    String   @unique @default(uuid())
  shop      String
  used      Boolean  @default(false)
  expiresAt DateTime  // 5 minutes from creation
  createdAt DateTime @default(now())

  @@index([ticket])
  @@index([expiresAt])
  @@index([shop])
}
```

## API Call Examples

### 1. Sync Merchant Credentials (afterAuth)
```graphql
mutation SyncCredentials($shop: String!, $accessToken: String!, $apiKey: String!) {
  syncMerchantCredentials(shop: $shop, accessToken: $accessToken, apiKey: $apiKey) {
    id
    shop
  }
}
```

Variables:
```json
{
  "shop": "store.myshopify.com",
  "accessToken": "shpua_xxx",
  "apiKey": "xxx"
}
```

### 2. Create Ticket (button click)
```graphql
mutation CreateTicket($shop: String!) {
  createTicket(shop: $shop) {
    ticket
  }
}
```

Variables:
```json
{
  "shop": "store.myshopify.com"
}
```

### 3. Exchange Ticket (external builder)
```graphql
mutation ExchangeTicket($ticket: String!) {
  exchangeTicket(ticket: $ticket) {
    shop
    accessToken
    apiKey
    builderData
  }
}
```

Variables:
```json
{
  "ticket": "uuid-here"
}
```

### 4. Update Builder Data (external builder)
```graphql
mutation SaveBuilderData($shop: String!, $builderData: JSON!) {
  updateBuilderData(shop: $shop, builderData: $builderData) {
    id
    builderData
  }
}
```

Variables:
```json
{
  "shop": "store.myshopify.com",
  "builderData": {
    "scene": { "background": "blue" },
    "products": [...]
  }
}
```

### 5. Delete Merchant Data (uninstall webhook)
```graphql
mutation DeleteData($shop: String!) {
  deleteMerchantData(shop: $shop)
}
```

Variables:
```json
{
  "shop": "store.myshopify.com"
}
```

## Security Requirements

### Multi-Tenancy
- All operations must be scoped by `shop` field
- One shop should never access another shop's data
- Tickets are bound to specific shops

### Ticket Security
- One-time use only (mark `used: true` immediately)
- 5-minute expiry window
- Delete expired tickets automatically
- Log all exchanges with IP addresses

### Error Handling
Your service should return appropriate errors:
- `Invalid or already used ticket` → 401
- `Ticket expired` → 401
- `Configuration not found` → 404
- Internal errors → 500

## Reference Implementation

See the files in `app/graphql/` for a reference implementation:
- `schema.ts` - GraphQL type definitions
- `resolvers.ts` - Resolver implementations using Prisma
- `context.ts` - Context setup

You can use these as a template for your external service.

## Testing

To test your external service, temporarily set `GRAPHQL_API_URL` to localhost:
```env
GRAPHQL_API_URL=http://localhost:4000/graphql
```

Then run your Shopify app and verify all operations work correctly.
