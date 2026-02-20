import type { ActionFunctionArgs } from "react-router";
import { findEComDataByKey, findStoreByShopUrl, getStorePlan } from "../api-client.server";

/**
 * Get merchant config by accessKey (for builder)
 * POST /api/merchant/get-config
 * Body: { key: string }
 * Returns: { shop, accessToken, apiKey, email, paymentMode, plan, dbName, isNew }
 */
export async function action({ request }: ActionFunctionArgs) {
  const clientIP = request.headers.get("x-forwarded-for") || "unknown";

  try {
    const { key } = await request.json();

    if (!key) {
      return Response.json({ error: "Access key required" }, { status: 400 });
    }

    const config = await findEComDataByKey(key);

    if (!config) {
      console.warn(`⚠️ Invalid access key attempt from IP: ${clientIP}`);
      return Response.json({ error: "Invalid access key" }, { status: 401 });
    }

    console.log(
      `✅ Builder accessed config for shop: ${config.data.shop} from IP: ${clientIP}`
    );

    // For "edit" commands, dbName is stored directly in data — use it without an
    // extra cross-database lookup. Fall back to findStoreByShopUrl for older records.
    const dbName = config.data.dbName
      ?? (await findStoreByShopUrl(config.data.shop))?.dbName
      ?? null;

    const plan = dbName ? await getStorePlan(dbName) : "freemium";

    return Response.json({
      shop: config.data.shop,
      dbName,
      accessToken: config.data.accessToken ?? null,
      apiKey: config.data.apiKey ?? null,
      email: config.data.email ?? null,
      paymentMode: config.data.paymentMode ?? "freemium", // backward compatibility
      plan,
      isNew: config.command === "shopify-create",
    });
  } catch (error) {
    console.error("Error fetching config:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
