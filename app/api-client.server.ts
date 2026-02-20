/**
 * External MongoDB GraphQL API client
 * All database operations go through this module instead of Prisma.
 *
 * API endpoint: process.env.MONGODB_API_URL
 * Auth: X-API-Key header from process.env.MONGODB_API_KEY
 * DB: "General"
 * Collections: "ShopifySessions", "ECommerceAppData"
 */

import { Session } from "@shopify/shopify-api";

const DB_NAME = "General";
const SESSIONS_COLLECTION = "ShopifySessions";
const ECOM_COLLECTION = "ECommerceAppData";

function getApiUrl(): string {
  return process.env.MONGODB_API_URL || "http://45.32.185.191:8000/graphql";
}

function getApiKey(): string {
  return process.env.MONGODB_API_KEY || "";
}

// ---------------------------------------------------------------------------
// Base request helper
// ---------------------------------------------------------------------------

async function gqlRequest<T = unknown>(
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const response = await fetch(getApiUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": getApiKey(),
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`API HTTP error: ${response.status}`);
  }

  const result = await response.json();

  if (result.errors?.length) {
    throw new Error(result.errors[0].message);
  }

  return result.data as T;
}

// ---------------------------------------------------------------------------
// Session document shape (as stored in external API)
// ---------------------------------------------------------------------------

interface SessionDoc {
  key: string;
  shop: string;
  state: string;
  isOnline: boolean;
  scope?: string | null;
  expires?: string | null;
  accessToken?: string | null;
  userId?: number | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  accountOwner?: boolean;
  locale?: string | null;
  collaborator?: boolean | null;
  emailVerified?: boolean | null;
  refreshToken?: string | null;
  refreshTokenExpires?: string | null;
}

// ---------------------------------------------------------------------------
// ECommerceAppData document shape
// ---------------------------------------------------------------------------

export interface EComData {
  key: string;
  ecomPlatform: string;
  command: string;
  createdAt?: string;
  updatedAt?: string;
  data: {
    shop: string;
    dbName?: string | null;
    accessToken?: string | null;
    apiKey?: string | null;
    email?: string | null;
    paymentMode?: string | null;
  };
}

// ---------------------------------------------------------------------------
// Session GraphQL field list
// ---------------------------------------------------------------------------

const SESSION_FIELDS = `
  key
  shop
  state
  isOnline
  scope
  expires
  accessToken
  userId
  firstName
  lastName
  email
  accountOwner
  locale
  collaborator
  emailVerified
  refreshToken
  refreshTokenExpires
`;

// ---------------------------------------------------------------------------
// ECommerceAppData GraphQL field list
// ---------------------------------------------------------------------------

const ECOM_FIELDS = `
  key
  ecomPlatform
  command
  createdAt
  updatedAt
  data {
    shop
    dbName
    accessToken
    apiKey
    email
    paymentMode
  }
`;

// ---------------------------------------------------------------------------
// Session helpers: reconstruct Shopify Session from raw doc
// ---------------------------------------------------------------------------

function docToSession(doc: SessionDoc): Session {
  const session = new Session({
    id: doc.key,
    shop: doc.shop,
    state: doc.state,
    isOnline: doc.isOnline,
  });

  if (doc.scope) session.scope = doc.scope;
  if (doc.expires) session.expires = new Date(doc.expires);
  if (doc.accessToken) session.accessToken = doc.accessToken;

  if (doc.userId != null) {
    session.onlineAccessInfo = {
      associated_user: {
        id: Number(doc.userId),
        first_name: doc.firstName ?? "",
        last_name: doc.lastName ?? "",
        email: doc.email ?? "",
        account_owner: doc.accountOwner ?? false,
        locale: doc.locale ?? "",
        collaborator: doc.collaborator ?? false,
        email_verified: doc.emailVerified ?? false,
      },
      associated_user_scope: doc.scope ?? "",
      expires_in: 0,
    };
  }

  if (doc.refreshToken) session.refreshToken = doc.refreshToken;
  if (doc.refreshTokenExpires)
    session.refreshTokenExpires = new Date(doc.refreshTokenExpires);

  return session;
}

// ---------------------------------------------------------------------------
// Session operations
// ---------------------------------------------------------------------------

export async function storeSession(session: Session): Promise<boolean> {
  try {
    const data: Record<string, unknown> = {
      key: session.id,
      shop: session.shop,
      state: session.state,
      isOnline: session.isOnline,
      scope: session.scope ?? null,
      expires: session.expires?.toISOString() ?? null,
      accessToken: session.accessToken ?? "",
      userId: session.onlineAccessInfo?.associated_user.id ?? null,
      firstName:
        session.onlineAccessInfo?.associated_user.first_name ?? null,
      lastName:
        session.onlineAccessInfo?.associated_user.last_name ?? null,
      email: session.onlineAccessInfo?.associated_user.email ?? null,
      accountOwner:
        session.onlineAccessInfo?.associated_user.account_owner ?? false,
      locale: session.onlineAccessInfo?.associated_user.locale ?? null,
      collaborator:
        session.onlineAccessInfo?.associated_user.collaborator ?? false,
      emailVerified:
        session.onlineAccessInfo?.associated_user.email_verified ?? false,
      refreshToken: session.refreshToken ?? null,
      refreshTokenExpires:
        session.refreshTokenExpires?.toISOString() ?? null,
    };

    await gqlRequest(
      `mutation writeDocumentByKey($db: String!, $col: String!, $document: DocumentInput!) {
        writeDocumentByKey(dbName: $db, collectionName: $col, document: $document) {
          success key message
        }
      }`,
      { db: DB_NAME, col: SESSIONS_COLLECTION, document: { data } }
    );

    return true;
  } catch (error) {
    console.error("Error storing session:", error);
    return false;
  }
}

export async function loadSession(id: string): Promise<Session | undefined> {
  try {
    const result = await gqlRequest<{ query: SessionDoc[] }>(
      `query($db: String!, $col: String!, $filter: [FilterInput!]) {
        query(dbName: $db, collectionName: $col, filter: $filter) {
          ${SESSION_FIELDS}
        }
      }`,
      {
        db: DB_NAME,
        col: SESSIONS_COLLECTION,
        filter: [{ field: "key", op: "==", value: id }],
      }
    );

    const docs = result?.query;
    if (!docs || docs.length === 0) return undefined;

    return docToSession(docs[0]);
  } catch (error) {
    console.error("Error loading session:", error);
    return undefined;
  }
}

export async function deleteSession(id: string): Promise<boolean> {
  try {
    await gqlRequest(
      `mutation writeDocumentByKey($db: String!, $col: String!, $document: DocumentInput!) {
        writeDocumentByKey(dbName: $db, collectionName: $col, document: $document) {
          success key message
        }
      }`,
      {
        db: DB_NAME,
        col: SESSIONS_COLLECTION,
        document: { delete: true, data: { key: id } },
      }
    );
    return true;
  } catch (error) {
    console.error("Error deleting session:", error);
    return false;
  }
}

export async function deleteSessions(ids: string[]): Promise<boolean> {
  try {
    await Promise.all(ids.map((id) => deleteSession(id)));
    return true;
  } catch (error) {
    console.error("Error deleting sessions:", error);
    return false;
  }
}

export async function findSessionsByShop(shop: string): Promise<Session[]> {
  try {
    const result = await gqlRequest<{ query: SessionDoc[] }>(
      `query($db: String!, $col: String!, $filter: [FilterInput!]) {
        query(dbName: $db, collectionName: $col, filter: $filter) {
          ${SESSION_FIELDS}
        }
      }`,
      {
        db: DB_NAME,
        col: SESSIONS_COLLECTION,
        filter: [{ field: "shop", op: "==", value: shop }],
      }
    );

    const docs = result?.query ?? [];
    return docs.map(docToSession);
  } catch (error) {
    console.error("Error finding sessions by shop:", error);
    return [];
  }
}

// ---------------------------------------------------------------------------
// ECommerceAppData operations
// ---------------------------------------------------------------------------

export async function findEComDataByShop(
  shop: string
): Promise<EComData | null> {
  try {
    const result = await gqlRequest<{ query: EComData[] }>(
      `query($db: String!, $col: String!, $filter: [FilterInput!]) {
        query(dbName: $db, collectionName: $col, filter: $filter) {
          ${ECOM_FIELDS}
        }
      }`,
      {
        db: DB_NAME,
        col: ECOM_COLLECTION,
        filter: [{ field: "data.shop", op: "==", value: shop }],
      }
    );

    const docs = result?.query;
    if (!docs || docs.length === 0) return null;
    return docs[0];
  } catch (error) {
    console.error("Error finding EComData by shop:", error);
    return null;
  }
}

export async function findEComDataByKey(key: string): Promise<EComData | null> {
  try {
    const result = await gqlRequest<{ query: EComData[] }>(
      `query($db: String!, $col: String!, $filter: [FilterInput!]) {
        query(dbName: $db, collectionName: $col, filter: $filter) {
          ${ECOM_FIELDS}
        }
      }`,
      {
        db: DB_NAME,
        col: ECOM_COLLECTION,
        filter: [{ field: "key", op: "==", value: key }],
      }
    );

    const docs = result?.query;
    if (!docs || docs.length === 0) return null;
    return docs[0];
  } catch (error) {
    console.error("Error finding EComData by key:", error);
    return null;
  }
}

export interface CreateEComDataInput {
  ecomPlatform: string;
  command: string;
  data: {
    shop: string;
    dbName?: string | null;
    accessToken?: string | null;
    apiKey?: string | null;
    email?: string | null;
    paymentMode?: string | null;
  };
}

/** Create a new ECommerceAppData document. Returns the auto-generated key (accessKey). */
export async function createEComData(
  input: CreateEComDataInput
): Promise<string> {
  const result = await gqlRequest<{
    writeDocumentByKey: { success: boolean; key: string; message: string };
  }>(
    `mutation writeDocumentByKey($db: String!, $col: String!, $document: DocumentInput!) {
      writeDocumentByKey(dbName: $db, collectionName: $col, document: $document) {
        success key message
      }
    }`,
    {
      db: DB_NAME,
      col: ECOM_COLLECTION,
      document: {
        data: {
          key: "", // empty → server auto-generates UUID
          ecomPlatform: input.ecomPlatform,
          command: input.command,
          data: input.data,
        },
      },
    }
  );

  return result.writeDocumentByKey.key;
}

export interface UpdateEComDataInput {
  command: string;
  data: {
    shop: string;
    dbName?: string | null;
    accessToken?: string | null;
    apiKey?: string | null;
    email?: string | null;
    paymentMode?: string | null;
  };
}

/** Update an existing ECommerceAppData document by its key. */
export async function updateEComData(
  key: string,
  input: UpdateEComDataInput
): Promise<void> {
  await gqlRequest(
    `mutation writeDocumentByKey($db: String!, $col: String!, $document: DocumentInput!) {
      writeDocumentByKey(dbName: $db, collectionName: $col, document: $document) {
        success key message
      }
    }`,
    {
      db: DB_NAME,
      col: ECOM_COLLECTION,
      document: {
        data: {
          key,
          command: input.command,
          data: input.data,
        },
      },
    }
  );
}

// ---------------------------------------------------------------------------
// Store DB lookup — cross-database search
// ---------------------------------------------------------------------------

/**
 * Search across all store databases for the ecom document whose ecomUrl
 * matches the given Shopify shop domain (e.g. "mystore.myshopify.com").
 * Uses dbName: "*" wildcard cross-database search.
 * Returns { dbName, storeId } or null if not found.
 */
export async function findStoreByShopUrl(
  shopUrl: string
): Promise<{ dbName: string; storeId: string } | null> {
  try {
    const result = await gqlRequest<{ query: { dbName: string; storeId: string; key: string }[] }>(
      `query($col: String!, $filter: [FilterInput!]) {
        query(dbName: "*", collectionName: $col, filter: $filter) {
          dbName
          storeId
          key
        }
      }`,
      {
        col: "StoreData",
        filter: [{ field: "ecomUrl", op: "==", value: shopUrl }],
      }
    );

    const docs = result?.query;
    if (!docs || docs.length === 0) return null;

    const doc = docs[0];
    return { dbName: doc.dbName, storeId: doc.storeId };
  } catch (error) {
    console.error("Error finding store by shop URL:", error);
    return null;
  }
}

/**
 * Read the paymentPlan from a store's StoreData.metadata document.
 * Defaults to "freemium" if the field is absent.
 */
export async function getStorePlan(dbName: string): Promise<string> {
  try {
    const result = await gqlRequest<{ query: { paymentPlan?: string }[] }>(
      `query($db: String!, $col: String!, $filter: [FilterInput!]) {
        query(dbName: $db, collectionName: $col, filter: $filter) {
          paymentPlan
        }
      }`,
      {
        db: dbName,
        col: "StoreData",
        filter: [{ field: "key", op: "==", value: "metadata" }],
      }
    );

    const docs = result?.query;
    if (!docs || docs.length === 0) return "freemium";
    return docs[0].paymentPlan ?? "freemium";
  } catch (error) {
    console.error("Error getting store plan:", error);
    return "freemium";
  }
}

/**
 * Write the paymentPlan field to a store's StoreData metadata document.
 * Uses writeDocumentByKey with key "metadata" — merges with existing fields.
 */
export async function updateStorePlan(
  dbName: string,
  paymentPlan: string
): Promise<void> {
  try {
    await gqlRequest(
      `mutation writeDocumentByKey($db: String!, $col: String!, $document: DocumentInput!) {
        writeDocumentByKey(dbName: $db, collectionName: $col, document: $document) {
          success key message
        }
      }`,
      {
        db: dbName,
        col: "StoreData",
        document: {
          data: {
            key: "metadata",
            paymentPlan: paymentPlan,
          },
        },
      }
    );
  } catch (error) {
    console.error("Error updating store plan:", error);
  }
}

/** Delete the ECommerceAppData document for a given shop (used on uninstall). */
export async function deleteEComDataByShop(shop: string): Promise<void> {
  const existing = await findEComDataByShop(shop);
  if (!existing) return;

  await gqlRequest(
    `mutation writeDocumentByKey($db: String!, $col: String!, $document: DocumentInput!) {
      writeDocumentByKey(dbName: $db, collectionName: $col, document: $document) {
        success key message
      }
    }`,
    {
      db: DB_NAME,
      col: ECOM_COLLECTION,
      document: { delete: true, data: { key: existing.key } },
    }
  );
}
