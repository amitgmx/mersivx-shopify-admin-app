import prisma from "../db.server";
import type { GraphQLContext } from "./context";

export const resolvers = {
  Query: {
    merchantConfig: async (_: any, { shop }: { shop: string }) => {
      return prisma.merchantConfig.findUnique({
        where: { shop },
      });
    },

    validateTicket: async (_: any, { ticket }: { ticket: string }) => {
      const ticketRecord = await prisma.oneTimeTicket.findUnique({
        where: { ticket },
      });

      if (!ticketRecord || ticketRecord.used) {
        return false;
      }

      if (ticketRecord.expiresAt < new Date()) {
        await prisma.oneTimeTicket.delete({ where: { id: ticketRecord.id } });
        return false;
      }

      return true;
    },
  },

  Mutation: {
    // Called by Shopify afterAuth hook
    syncMerchantCredentials: async (
      _: any,
      {
        shop,
        accessToken,
        apiKey,
      }: { shop: string; accessToken: string; apiKey: string },
      context: GraphQLContext
    ) => {
      // Log for audit trail
      const clientIP = context.request.headers.get("x-forwarded-for") || "unknown";
      console.log(`🔄 Syncing credentials for ${shop} from IP: ${clientIP}`);

      return prisma.merchantConfig.upsert({
        where: { shop },
        create: {
          shop,
          accessToken,
          apiKey,
          builderData: null,
        },
        update: {
          accessToken,
          apiKey,
          updatedAt: new Date(),
        },
      });
    },

    // Called by Shopify app to create tickets
    createTicket: async (
      _: any,
      { shop }: { shop: string },
      context: GraphQLContext
    ) => {
      const clientIP = context.request.headers.get("x-forwarded-for") || "unknown";
      console.log(`🎫 Creating ticket for ${shop} from IP: ${clientIP}`);

      const ticket = await prisma.oneTimeTicket.create({
        data: {
          shop,
          used: false,
          expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
        },
      });

      return { ticket: ticket.ticket };
    },

    // Called by external builder to exchange tickets
    exchangeTicket: async (
      _: any,
      { ticket }: { ticket: string },
      context: GraphQLContext
    ) => {
      const clientIP = context.request.headers.get("x-forwarded-for") || "unknown";

      // Find unused, non-expired ticket
      const ticketRecord = await prisma.oneTimeTicket.findUnique({
        where: { ticket },
      });

      if (!ticketRecord || ticketRecord.used) {
        console.warn(`⚠️ Invalid ticket attempt from IP: ${clientIP}`);
        throw new Error("Invalid or already used ticket");
      }

      // Check expiry
      if (ticketRecord.expiresAt < new Date()) {
        await prisma.oneTimeTicket.delete({ where: { id: ticketRecord.id } });
        throw new Error("Ticket expired");
      }

      // Mark ticket as used (one-time use only)
      await prisma.oneTimeTicket.update({
        where: { id: ticketRecord.id },
        data: { used: true },
      });

      // Get merchant config
      const config = await prisma.merchantConfig.findUnique({
        where: { shop: ticketRecord.shop },
      });

      if (!config) {
        throw new Error("Configuration not found");
      }

      // Log successful exchange for audit trail
      console.log(
        `✅ Ticket exchanged for shop: ${config.shop} from IP: ${clientIP}`
      );

      return {
        shop: config.shop,
        accessToken: config.accessToken,
        apiKey: config.apiKey,
        builderData: config.builderData,
      };
    },

    // Called by external builder to save builder configuration
    updateBuilderData: async (
      _: any,
      { shop, builderData }: { shop: string; builderData: any },
      context: GraphQLContext
    ) => {
      const clientIP = context.request.headers.get("x-forwarded-for") || "unknown";
      console.log(`💾 Updating builder data for ${shop} from IP: ${clientIP}`);

      return prisma.merchantConfig.update({
        where: { shop },
        data: {
          builderData,
          updatedAt: new Date(),
        },
      });
    },

    // Called by uninstall webhook
    deleteMerchantData: async (
      _: any,
      { shop }: { shop: string },
      context: GraphQLContext
    ) => {
      console.log(`🗑️ Deleting merchant data for ${shop}`);

      try {
        // Delete merchant config
        await prisma.merchantConfig.deleteMany({
          where: { shop },
        });

        // Delete any unused tickets
        await prisma.oneTimeTicket.deleteMany({
          where: { shop },
        });

        console.log(`✅ Cleaned up data for ${shop}`);
        return true;
      } catch (error) {
        console.error(`Error cleaning up ${shop}:`, error);
        return false;
      }
    },
  },
};
