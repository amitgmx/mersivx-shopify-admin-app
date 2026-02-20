import { useState, useEffect } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate, BASIC_PLAN, PREMIUM_PLAN } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  findEComDataByShop,
  findStoreByShopUrl,
  getStorePlan,
} from "../api-client.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, billing } = await authenticate.admin(request);

  const userEmail = session.onlineAccessInfo?.associated_user.email || "";

  const [ecomData, storeRecord] = await Promise.all([
    findEComDataByShop(session.shop),
    findStoreByShopUrl(session.shop),
  ]);

  let currentPlan: string;
  if (storeRecord) {
    // Store exists in MongoDB — read its persistent plan from StoreData.metadata.
    currentPlan = await getStorePlan(storeRecord.dbName);
  } else {
    // Store hasn't been created yet — check Shopify billing for a confirmed subscription.
    currentPlan = "freemium";
    try {
      const { hasActivePayment, appSubscriptions } = await billing.check({
        plans: [BASIC_PLAN, PREMIUM_PLAN],
        isTest: process.env.NODE_ENV !== "production",
      });
      if (hasActivePayment && appSubscriptions.length > 0) {
        const sub = appSubscriptions[0];
        currentPlan =
          sub.name === BASIC_PLAN ? "basic" :
          sub.name === PREMIUM_PLAN ? "premium" : "freemium";
      }
    } catch {
      // Billing check is best-effort; leave as freemium
    }
  }

  return {
    shop: session.shop,
    userEmail,
    builderUrl: process.env.BUILDER_SYSTEM_URL || "https://www.mersivx.com",
    currentPlan,
    isExistingStore: !!storeRecord,
    storeDbName: storeRecord?.dbName ?? null,
    merchantConfig: ecomData
      ? {
          email: ecomData.data.email ?? null,
          accessKey: ecomData.key,
          createdAt: ecomData.createdAt ?? new Date().toISOString(),
        }
      : null,
  };
};

const PLAN_LABELS: Record<string, string> = {
  freemium: "Freemium",
  basic: "Basic",
  premium: "Premium",
};

export default function Index() {
  const { shop, userEmail, builderUrl, merchantConfig, currentPlan, isExistingStore, storeDbName } =
    useLoaderData<typeof loader>();
  const shopify = useAppBridge();

  const [email, setEmail] = useState(merchantConfig?.email || userEmail);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [iframeUrl, setIframeUrl] = useState<string>("");

  const requestUpgrade = async (plan: "basic" | "premium") => {
    setIsUpgrading(true);
    setBillingError(null);
    try {
      const token = await shopify.idToken();
      const response = await fetch("/api/billing/request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ plan }),
      });
      const data = await response.json() as { confirmationUrl?: string; error?: string; details?: unknown };
      if (data.confirmationUrl) {
        window.open(data.confirmationUrl, "_top");
      } else if (data.error) {
        const details = data.details ? ` — ${JSON.stringify(data.details)}` : "";
        console.error("Billing error:", data.error, data.details);
        setBillingError(`${data.error}${details}`);
      }
    } catch (err) {
      console.error("Billing request failed:", err);
      setBillingError("Failed to start billing upgrade. Please try again.");
    } finally {
      setIsUpgrading(false);
    }
  };

  const runBuilder = async () => {
    setIsProcessing(true);

    try {
      const token = await shopify.idToken();
      // Existing stores pass dbName so the builder loads the existing project.
      // New stores pass email so the builder can set up the new project.
      const body = isExistingStore
        ? { storeDbName }
        : { email };

      const response = await fetch("/api/merchant/configure", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const res = await response.json().catch(() => ({}));
        throw new Error((res as { error?: string }).error || "Failed to configure merchant");
      }

      const { accessKey } = await response.json();

      const builderUrlWithKey = `${builderUrl}?key=${accessKey}`;
      window.open(builderUrlWithKey, "_blank");

      shopify.toast.show("Opening Builder...");
    } catch (error) {
      console.error("Error launching builder:", error);
      shopify.toast.show("Failed to launch builder", { isError: true });
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    if (merchantConfig?.accessKey) {
      setIframeUrl(`${builderUrl}?key=${merchantConfig.accessKey}`);
    } else {
      setIframeUrl(`${builderUrl}?mode=preview`);
    }
  }, [builderUrl, merchantConfig]);

  const planCard = (
    plan: "freemium" | "basic" | "premium",
    price: string,
    features: string[]
  ) => {
    const isCurrent = currentPlan === plan;
    const canUpgrade = !isCurrent;

    return (
      <div style={{ flex: "1", minWidth: "200px" }}>
      <s-box
        padding="base"
        borderWidth="base"
        borderRadius="base"
      >
        <s-stack direction="block" gap="base">
          <strong>{PLAN_LABELS[plan]}</strong>
          {isCurrent && (
            <s-badge tone="success">Current Plan</s-badge>
          )}
          <s-paragraph>{price}</s-paragraph>
          <s-unordered-list>
            {features.map((f) => (
              <s-list-item key={f}>{f}</s-list-item>
            ))}
          </s-unordered-list>
          {plan !== "freemium" && !isCurrent && (
            <s-button
              variant="primary"
              onClick={() => requestUpgrade(plan)}
              disabled={isUpgrading || !canUpgrade}
              {...(isUpgrading ? { loading: true } : {})}
            >
              {`Upgrade to ${PLAN_LABELS[plan]}`}
            </s-button>
          )}
        </s-stack>
      </s-box>
      </div>
    );
  };

  return (
    <s-page heading="Mersivx 3D Builder">
      {/* Plan Selection */}
      <s-section heading="Choose Your Plan">
        <s-paragraph>Select the plan that works best for your store</s-paragraph>

        {billingError && (
          <s-banner tone="critical">
            <s-paragraph>
              <strong>Billing error:</strong> {billingError}
            </s-paragraph>
          </s-banner>
        )}

        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
          {planCard("freemium", "Free forever", [
            "Basic 3D builder",
            "1 active scene",
            "Standard support",
          ])}
          {planCard("basic", "$19 / month", [
            "Everything in Freemium",
            "5 active scenes",
            "Priority support",
          ])}
          {planCard("premium", "$49 / month", [
            "Everything in Basic",
            "Unlimited scenes",
            "Custom domain",
            "Dedicated support",
          ])}
        </div>

      </s-section>

      {/* Email Configuration — only needed when creating a new store */}
      {!isExistingStore && (
        <s-section heading="Contact Email">
          <s-paragraph>
            This email will be used for notifications and updates from the builder
          </s-paragraph>

          <div style={{ maxWidth: "400px" }}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              style={{
                width: "100%",
                padding: "8px 12px",
                border: "1px solid #ccc",
                borderRadius: "4px",
                fontSize: "14px",
                boxSizing: "border-box",
              }}
            />
          </div>

          {!email && (
            <s-banner tone="warning">
              <s-paragraph>Please enter your email address to continue</s-paragraph>
            </s-banner>
          )}
        </s-section>
      )}

      {/* Store Status */}
      {isExistingStore && (
        <s-section heading="Store Status">
          <s-banner tone="success">
            <s-paragraph>
              <strong>Store Active</strong> — Your 3D store is ready to edit.
            </s-paragraph>
          </s-banner>
        </s-section>
      )}

      {/* Launch Builder */}
      <s-section heading="Launch Builder">
        <s-paragraph>
          {isExistingStore
            ? "Choose how to access your 3D store builder:"
            : "Create your immersive 3D shopping experience"}
        </s-paragraph>

        <s-stack direction="block" gap="base">
          <div>
            <s-paragraph>
              Continue building your 3D store in a new browser tab
            </s-paragraph>
            <s-button
              onClick={runBuilder}
              variant="primary"
              disabled={(!isExistingStore && !email) || isProcessing}
              {...(isProcessing ? { loading: true } : {})}
            >
              {isExistingStore ? "Open in New Tab" : "Create 3D Store"}
            </s-button>
          </div>
        </s-stack>
      </s-section>

      {/* Builder Preview (iframe) */}
      {iframeUrl && (
        <s-section heading={isExistingStore ? "Builder Preview" : "3D Store Preview"}>
          <s-paragraph>
            {isExistingStore
              ? "Interactive builder embedded within the Shopify Admin"
              : "Preview the 3D store builder interface below. Click 'Create 3D Store' above to start building."}
          </s-paragraph>

          <s-box padding="base" borderWidth="base" borderRadius="base">
            <div style={{ position: "relative", width: "100%", height: "600px" }}>
              {!iframeLoaded && (
                <div
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                    textAlign: "center",
                  }}
                >
                  <s-spinner size="large" />
                  <s-paragraph>Loading builder...</s-paragraph>
                </div>
              )}
              <iframe
                src={iframeUrl}
                style={{ width: "100%", height: "100%", border: "none" }}
                title="Mersivx Builder Preview"
                onLoad={() => setIframeLoaded(true)}
              />
            </div>
          </s-box>
        </s-section>
      )}

      {/* Sidebar */}
      <s-section slot="aside" heading="Store Info">
        <s-paragraph>
          <strong>Store:</strong> {shop}
        </s-paragraph>
        <s-paragraph>
          <strong>Plan:</strong> {PLAN_LABELS[currentPlan] ?? currentPlan}
        </s-paragraph>
        {isExistingStore && (
          <s-paragraph>
            <strong>Status:</strong> Active
          </s-paragraph>
        )}
      </s-section>

      <s-section slot="aside" heading="Permissions">
        <s-paragraph>This app has access to:</s-paragraph>
        <s-unordered-list>
          <s-list-item>View Products</s-list-item>
          <s-list-item>View Orders</s-list-item>
          <s-list-item>View Discounts</s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
