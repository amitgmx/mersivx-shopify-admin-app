import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { loadSession, storeSession } from "../api-client.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, session, topic, shop } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  const current = payload.current as string[];

  if (session) {
    // Load the full stored session, update its scope, and write it back
    const stored = await loadSession(session.id);
    if (stored) {
      stored.scope = current.toString();
      await storeSession(stored);
    }
  }

  return new Response();
};
