import { Session } from "@shopify/shopify-api";
import { SessionStorage } from "@shopify/shopify-app-session-storage";
import {
  storeSession as apiStoreSession,
  loadSession as apiLoadSession,
  deleteSession as apiDeleteSession,
  deleteSessions as apiDeleteSessions,
  findSessionsByShop as apiFindSessionsByShop,
} from "./api-client.server";

/**
 * Session storage backed by the external MongoDB GraphQL API.
 * Replaces the previous Prisma-based implementation.
 */
export class MongoDBSessionStorage implements SessionStorage {
  async storeSession(session: Session): Promise<boolean> {
    return apiStoreSession(session);
  }

  async loadSession(id: string): Promise<Session | undefined> {
    return apiLoadSession(id);
  }

  async deleteSession(id: string): Promise<boolean> {
    return apiDeleteSession(id);
  }

  async deleteSessions(ids: string[]): Promise<boolean> {
    return apiDeleteSessions(ids);
  }

  async findSessionsByShop(shop: string): Promise<Session[]> {
    return apiFindSessionsByShop(shop);
  }
}
