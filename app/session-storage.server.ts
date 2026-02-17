import { Session } from "@shopify/shopify-api";
import { SessionStorage } from "@shopify/shopify-app-session-storage";
import prisma from "./db.server";

/**
 * Custom session storage for MongoDB
 * MongoDB doesn't allow updating the _id field, so we need to override
 * the storeSession method to exclude id from updates
 */
export class MongoDBSessionStorage implements SessionStorage {
  async storeSession(session: Session): Promise<boolean> {
    try {
      const data = {
        shop: session.shop,
        state: session.state,
        isOnline: session.isOnline,
        scope: session.scope ?? null,
        expires: session.expires ?? null,
        accessToken: session.accessToken ?? "",
        userId: session.onlineAccessInfo?.associated_user.id
          ? BigInt(session.onlineAccessInfo.associated_user.id)
          : null,
        firstName: session.onlineAccessInfo?.associated_user.first_name ?? null,
        lastName: session.onlineAccessInfo?.associated_user.last_name ?? null,
        email: session.onlineAccessInfo?.associated_user.email ?? null,
        accountOwner:
          session.onlineAccessInfo?.associated_user.account_owner ?? false,
        locale: session.onlineAccessInfo?.associated_user.locale ?? null,
        collaborator:
          session.onlineAccessInfo?.associated_user.collaborator ?? false,
        emailVerified:
          session.onlineAccessInfo?.associated_user.email_verified ?? false,
        refreshToken: session.refreshToken ?? null,
        refreshTokenExpires: session.refreshTokenExpires ?? null,
      };

      await prisma.session.upsert({
        where: { id: session.id },
        update: data, // Don't include id in update for MongoDB
        create: {
          id: session.id,
          ...data,
        },
      });

      return true;
    } catch (error) {
      console.error("Error storing session:", error);
      return false;
    }
  }

  async loadSession(id: string): Promise<Session | undefined> {
    try {
      const sessionData = await prisma.session.findUnique({
        where: { id },
      });

      if (!sessionData) {
        return undefined;
      }

      const session = new Session({
        id: sessionData.id,
        shop: sessionData.shop,
        state: sessionData.state,
        isOnline: sessionData.isOnline,
      });

      if (sessionData.expires) {
        session.expires = sessionData.expires;
      }

      if (sessionData.scope) {
        session.scope = sessionData.scope;
      }

      if (sessionData.accessToken) {
        session.accessToken = sessionData.accessToken;
      }

      if (sessionData.userId) {
        session.onlineAccessInfo = {
          associated_user: {
            id: Number(sessionData.userId),
            first_name: sessionData.firstName ?? "",
            last_name: sessionData.lastName ?? "",
            email: sessionData.email ?? "",
            account_owner: sessionData.accountOwner,
            locale: sessionData.locale ?? "",
            collaborator: sessionData.collaborator ?? false,
            email_verified: sessionData.emailVerified ?? false,
          },
          associated_user_scope: sessionData.scope ?? "",
          expires_in: 0,
        };
      }

      if (sessionData.refreshToken) {
        session.refreshToken = sessionData.refreshToken;
      }

      if (sessionData.refreshTokenExpires) {
        session.refreshTokenExpires = sessionData.refreshTokenExpires;
      }

      return session;
    } catch (error) {
      console.error("Error loading session:", error);
      return undefined;
    }
  }

  async deleteSession(id: string): Promise<boolean> {
    try {
      await prisma.session.delete({
        where: { id },
      });
      return true;
    } catch (error) {
      console.error("Error deleting session:", error);
      return false;
    }
  }

  async deleteSessions(ids: string[]): Promise<boolean> {
    try {
      await prisma.session.deleteMany({
        where: {
          id: {
            in: ids,
          },
        },
      });
      return true;
    } catch (error) {
      console.error("Error deleting sessions:", error);
      return false;
    }
  }

  async findSessionsByShop(shop: string): Promise<Session[]> {
    try {
      const sessions = await prisma.session.findMany({
        where: { shop },
      });

      return sessions.map((sessionData) => {
        const session = new Session({
          id: sessionData.id,
          shop: sessionData.shop,
          state: sessionData.state,
          isOnline: sessionData.isOnline,
        });

        if (sessionData.expires) {
          session.expires = sessionData.expires;
        }

        if (sessionData.scope) {
          session.scope = sessionData.scope;
        }

        if (sessionData.accessToken) {
          session.accessToken = sessionData.accessToken;
        }

        return session;
      });
    } catch (error) {
      console.error("Error finding sessions by shop:", error);
      return [];
    }
  }
}
