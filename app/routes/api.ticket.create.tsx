import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

/**
 * Create one-time ticket for external page authentication
 * POST /api/ticket/create
 * Returns: { ticket: "uuid" }
 */
export async function action({ request }: ActionFunctionArgs) {
  try {
    const { session } = await authenticate.admin(request);

    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Create one-time ticket (5-minute expiry)
    const ticket = await prisma.oneTimeTicket.create({
      data: {
        shop: session.shop,
        used: false,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
      },
    });

    return Response.json({ ticket: ticket.ticket });
  } catch (error) {
    console.error("Error creating ticket:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
