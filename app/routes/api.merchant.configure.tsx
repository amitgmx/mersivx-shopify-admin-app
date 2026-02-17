import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

/**
 * Configure merchant - create or update MerchantConfig
 * POST /api/merchant/configure
 * Body: { email: string, paymentMode: string }
 * Returns: { accessKey: string, isNew: boolean }
 */
export async function action({ request }: ActionFunctionArgs) {
  try {
    const { session } = await authenticate.admin(request);

    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { email, paymentMode } = await request.json();

    if (!email) {
      return Response.json({ error: "Email required" }, { status: 400 });
    }

    // Check if merchant config already exists
    const existing = await prisma.merchantConfig.findUnique({
      where: { shop: session.shop },
    });

    if (existing) {
      // Existing store - update email and payment mode
      // Generate accessKey if it doesn't exist (for legacy records)
      const updateData: any = {
        email,
        paymentMode,
        updatedAt: new Date(),
      };

      if (!existing.accessKey) {
        updateData.accessKey = crypto.randomUUID();
        console.log(`🔑 Generated accessKey for existing store ${session.shop}`);
      }

      const updated = await prisma.merchantConfig.update({
        where: { shop: session.shop },
        data: updateData,
      });

      console.log(`✅ Updated config for ${session.shop}`);
      return Response.json({
        accessKey: updated.accessKey,
        isNew: false,
      });
    } else {
      // New store - create full config with credentials
      const created = await prisma.merchantConfig.create({
        data: {
          shop: session.shop,
          accessToken: session.accessToken || "",
          apiKey: process.env.SHOPIFY_API_KEY || "",
          email,
          paymentMode,
          accessKey: crypto.randomUUID(),
          builderData: null,
        },
      });

      console.log(`✅ Created config for ${session.shop}`);
      return Response.json({
        accessKey: created.accessKey,
        isNew: true,
      });
    }
  } catch (error) {
    console.error("Error configuring merchant:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
