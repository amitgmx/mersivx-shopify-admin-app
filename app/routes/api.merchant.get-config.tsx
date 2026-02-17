import type { ActionFunctionArgs} from "react-router";
import prisma from "../db.server";

/**
 * Get merchant config by accessKey (for builder)
 * POST /api/merchant/get-config
 * Body: { key: string }
 * Returns: { shop, accessToken, apiKey, email, paymentMode, builderData, isNew }
 */
export async function action({ request }: ActionFunctionArgs) {
  const clientIP = request.headers.get("x-forwarded-for") || "unknown";

  try {
    const { key } = await request.json();

    if (!key) {
      return Response.json({ error: "Access key required" }, { status: 400 });
    }

    // Find merchant config by accessKey
    const config = await prisma.merchantConfig.findUnique({
      where: { accessKey: key },
    });

    if (!config) {
      console.warn(`⚠️ Invalid access key attempt from IP: ${clientIP}`);
      return Response.json({ error: "Invalid access key" }, { status: 401 });
    }

    // Log successful access
    console.log(`✅ Builder accessed config for shop: ${config.shop} from IP: ${clientIP}`);

    // Determine if this is a new store (no builderData yet)
    const isNew = !config.builderData;

    // Return configuration
    return Response.json({
      shop: config.shop,
      accessToken: config.accessToken,
      apiKey: config.apiKey,
      email: config.email,
      paymentMode: config.paymentMode,
      builderData: config.builderData,
      isNew,
    });
  } catch (error) {
    console.error("Error fetching config:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
