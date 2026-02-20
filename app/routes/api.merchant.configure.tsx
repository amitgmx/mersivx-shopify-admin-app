import type { ActionFunctionArgs } from "react-router";
import { authenticate, BASIC_PLAN, PREMIUM_PLAN } from "../shopify.server";
import {
  findStoreByShopUrl,
  createEComData,
} from "../api-client.server";

/**
 * Configure merchant - always creates a fresh ECommerceAppData (messaging unit).
 * POST /api/merchant/configure
 * Body (existing store): { storeDbName?: string } — storeDbName is a hint but server re-derives it
 * Body (new store):      { email: string }
 * Returns: { accessKey: string, isNew: boolean }
 */
export async function action({ request }: ActionFunctionArgs) {
  try {
    const { session, billing } = await authenticate.admin(request);

    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json() as { email?: string };
    const { email } = body;

    // Source of truth: does a 3D store already exist in MongoDB for this shop?
    const storeRecord = await findStoreByShopUrl(session.shop);

    if (storeRecord) {
      // Existing 3D store — create a minimal "edit" ECommerceAppData so the builder
      // loads the existing project rather than creating a new one.
      const accessKey = await createEComData({
        ecomPlatform: "shopify",
        command: "shopify_edit",
        data: {
          shop: session.shop,
          dbName: storeRecord.dbName,
        },
      });

      console.log(`✅ Created ECommerceAppData for ${session.shop} (edit, dbName: ${storeRecord.dbName})`);
      return Response.json({ accessKey, isNew: false });
    } else {
      // New store — require email; bake in billing plan and full credentials.
      if (!email) {
        return Response.json({ error: "Email required" }, { status: 400 });
      }

      let paymentMode = "freemium";
      try {
        const { hasActivePayment, appSubscriptions } = await billing.check({
          plans: [BASIC_PLAN, PREMIUM_PLAN],
          isTest: process.env.NODE_ENV !== "production",
        });
        if (hasActivePayment && appSubscriptions.length > 0) {
          const sub = appSubscriptions[0];
          paymentMode =
            sub.name === BASIC_PLAN ? "basic" :
            sub.name === PREMIUM_PLAN ? "premium" : "freemium";
        }
      } catch {
        // Billing check is best-effort — default to freemium
      }

      console.log(`💳 Store creation paymentMode: ${paymentMode} for ${session.shop}`);

      const accessKey = await createEComData({
        ecomPlatform: "shopify",
        command: "shopify-create",
        data: {
          shop: session.shop,
          accessToken: session.accessToken || "",
          apiKey: process.env.SHOPIFY_API_KEY || "",
          email,
          paymentMode,
        },
      });

      console.log(`✅ Created ECommerceAppData for ${session.shop} (paymentMode: ${paymentMode})`);
      return Response.json({ accessKey, isNew: true });
    }
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("Error configuring merchant:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
