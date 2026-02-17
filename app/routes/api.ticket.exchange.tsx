import type { ActionFunctionArgs } from "react-router";
import prisma from "../db.server";

/**
 * Exchange one-time ticket for credentials
 * POST /api/ticket/exchange
 * Body: { ticket: "uuid" }
 * Returns: { shop, accessToken, apiKey, builderData }
 *
 * Security: Multi-tenant safe - each ticket is bound to a specific shop
 */
export async function action({ request }: ActionFunctionArgs) {
  const clientIP = request.headers.get("x-forwarded-for") || "unknown";

  try {
    const { ticket } = await request.json();

    if (!ticket) {
      return Response.json({ error: "Ticket required" }, { status: 400 });
    }

    // Find unused, non-expired ticket
    const ticketRecord = await prisma.oneTimeTicket.findUnique({
      where: { ticket },
    });

    if (!ticketRecord || ticketRecord.used) {
      console.warn(`⚠️ Invalid ticket attempt from IP: ${clientIP}`);
      return Response.json({ error: "Invalid ticket" }, { status: 401 });
    }

    // Check expiry
    if (ticketRecord.expiresAt < new Date()) {
      await prisma.oneTimeTicket.delete({ where: { id: ticketRecord.id } });
      return Response.json({ error: "Ticket expired" }, { status: 401 });
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
      return Response.json(
        { error: "Configuration not found" },
        { status: 404 }
      );
    }

    // Log successful exchange for audit trail
    console.log(`✅ Ticket exchanged for shop: ${config.shop} from IP: ${clientIP}`);

    // Return credentials
    return Response.json({
      shop: config.shop,
      accessToken: config.accessToken,
      apiKey: config.apiKey,
      builderData: config.builderData,
    });
  } catch (error) {
    console.error("Error exchanging ticket:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
