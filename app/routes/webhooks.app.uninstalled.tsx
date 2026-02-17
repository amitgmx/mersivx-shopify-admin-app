import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  try {
    // Delete sessions from MongoDB (Prisma)
    if (session) {
      await prisma.session.deleteMany({ where: { shop } });
    }

    // Delete merchant config (credentials and builder data)
    await prisma.merchantConfig.deleteMany({
      where: { shop },
    });

    // Delete any unused tickets for this shop
    await prisma.oneTimeTicket.deleteMany({
      where: { shop },
    });

    console.log(`✅ Cleaned up all data for ${shop}`);
  } catch (error) {
    console.error(`Error cleaning up ${shop}:`, error);
  }

  return new Response();
};
