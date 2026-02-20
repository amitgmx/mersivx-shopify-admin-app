import type { ActionFunctionArgs } from "react-router";
import { authenticate, BASIC_PLAN, PREMIUM_PLAN } from "../shopify.server";

type ShopifyPlanName = typeof BASIC_PLAN | typeof PREMIUM_PLAN;

const PLAN_MAP: Record<string, ShopifyPlanName> = {
  basic: BASIC_PLAN,
  premium: PREMIUM_PLAN,
};

export async function action({ request }: ActionFunctionArgs) {
  const { session, billing } = await authenticate.admin(request);

  let plan: string;
  try {
    const body = await request.json() as { plan?: string };
    plan = body.plan ?? "";
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const shopifyPlanName = PLAN_MAP[plan];
  if (!shopifyPlanName) {
    return Response.json({ error: "Invalid plan" }, { status: 400 });
  }

  const isTest = process.env.NODE_ENV !== "production";
  const returnUrl = `${process.env.SHOPIFY_APP_URL}/app/billing/callback?shop=${session.shop}&plan=${encodeURIComponent(shopifyPlanName)}`;

  console.log(`[billing.request] plan=${shopifyPlanName} isTest=${isTest} returnUrl=${returnUrl}`);

  // billing.request() always throws — either a redirect Response (success)
  // or a BillingError if the Shopify API call fails.
  try {
    await billing.request({
      plan: shopifyPlanName,
      isTest,
      returnUrl,
    });
  } catch (error) {
    if (error instanceof Response) {
      // billing.request() throws a 401 Response with the billing URL in the header (success path).
      // Extract the URL and return it as JSON — the client will navigate to it.
      const confirmationUrl = error.headers.get('X-Shopify-API-Request-Failure-Reauthorize-Url');
      if (confirmationUrl) {
        console.log(`[billing.request] Got confirmation URL: ${confirmationUrl}`);
        return Response.json({ confirmationUrl });
      }
      throw error; // unknown Response type — let React Router handle it
    }

    // Real billing error — log the details and return a structured error.
    const billingError = error as { message?: string; errorData?: unknown };
    console.error("❌ Billing request failed:", billingError.message);
    console.error("   errorData:", JSON.stringify(billingError.errorData, null, 2));
    return Response.json(
      { error: billingError.message ?? "Billing request failed", details: billingError.errorData },
      { status: 500 }
    );
  }
}
