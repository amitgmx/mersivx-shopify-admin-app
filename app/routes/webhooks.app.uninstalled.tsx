import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  findSessionsByShop,
  deleteSessions,
  deleteEComDataByShop,
} from "../api-client.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  try {
    // Delete all sessions for this shop
    const sessions = await findSessionsByShop(shop);
    if (sessions.length > 0) {
      await deleteSessions(sessions.map((s) => s.id));
    }

    // Delete ECommerceAppData for this shop
    await deleteEComDataByShop(shop);

    console.log(`✅ Cleaned up all data for ${shop}`);
  } catch (error) {
    console.error(`Error cleaning up ${shop}:`, error);
  }

  return new Response();
};
