import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { unauthenticated, BASIC_PLAN, PREMIUM_PLAN } from "../shopify.server";
import { findStoreByShopUrl, updateStorePlan } from "../api-client.server";

// Map Shopify plan names (passed in returnUrl query param) back to internal plan keys.
const SHOPIFY_PLAN_TO_INTERNAL: Record<string, string> = {
  [BASIC_PLAN]: "basic",
  [PREMIUM_PLAN]: "premium",
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (!shop) {
    return redirect("/auth/login");
  }

  // The billing request encodes the confirmed plan name in the returnUrl so we
  // don't need to re-query Shopify (avoids race conditions and offline-session issues).
  const planParam = url.searchParams.get("plan");
  const planFromParam = planParam ? SHOPIFY_PLAN_TO_INTERNAL[decodeURIComponent(planParam)] : undefined;

  let resolvedPlan: string | undefined = planFromParam;

  // If we couldn't determine the plan from query params, fall back to querying Shopify.
  if (!resolvedPlan) {
    try {
      const { admin } = await unauthenticated.admin(shop);

      const response = await admin.graphql(`
        #graphql
        query GetBillingStatus {
          currentAppInstallation {
            activeSubscriptions {
              name
              status
            }
          }
        }
      `);
      const result = await response.json();
      const installation = result.data?.currentAppInstallation;

      const subscriptions: Array<{ name: string; status: string }> =
        installation?.activeSubscriptions ?? [];

      if (subscriptions.length > 0) {
        const sub = subscriptions[0];
        resolvedPlan =
          sub.name === BASIC_PLAN ? "basic" :
          sub.name === PREMIUM_PLAN ? "premium" : "freemium";
      } else {
        resolvedPlan = "freemium";
      }

      console.log(`💳 Billing confirmed (via Shopify query): ${resolvedPlan} for ${shop}`);
    } catch (err) {
      console.error("❌ Billing callback — Shopify query failed:", err);
    }
  } else {
    console.log(`💳 Billing confirmed (via returnUrl param): ${resolvedPlan} for ${shop}`);
  }

  // Update MongoDB if we have a plan to write.
  if (resolvedPlan) {
    try {
      const storeRecord = await findStoreByShopUrl(shop);
      if (storeRecord) {
        await updateStorePlan(storeRecord.dbName, resolvedPlan);
        console.log(`✅ StoreData.metadata paymentPlan updated to ${resolvedPlan}`);
      } else {
        console.log(`ℹ️ No store yet for ${shop} — plan baked in at store creation`);
      }
    } catch (err) {
      console.error("❌ Billing callback — MongoDB update failed:", err);
    }
  }

  // Redirect into the Shopify Admin embedded context via the store's own admin URL.
  return redirect(`https://${shop}/admin/apps/${process.env.APP_NAME}/app`);
};
