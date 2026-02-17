import { useState, useEffect } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  // Query existing merchant config
  const merchantConfig = await prisma.merchantConfig.findUnique({
    where: { shop: session.shop },
  });

  // Get user email from session table
  const sessionData = await prisma.session.findUnique({
    where: { id: session.id },
    select: { email: true, isOnline: true },
  });

  // Debug logging
  console.log("📧 Session debug:", {
    sessionId: session.id,
    isOnline: sessionData?.isOnline,
    email: sessionData?.email,
  });

  return {
    shop: session.shop,
    userEmail: sessionData?.email || "",
    builderUrl: process.env.BUILDER_SYSTEM_URL || "https://www.mersivx.com",
    merchantConfig: merchantConfig ? {
      email: merchantConfig.email,
      paymentMode: merchantConfig.paymentMode,
      accessKey: merchantConfig.accessKey || null, // May be null for legacy records
      createdAt: merchantConfig.createdAt.toISOString(),
    } : null,
  };
};

export default function Index() {
  const { shop, userEmail, builderUrl, merchantConfig } =
    useLoaderData<typeof loader>();
  const shopify = useAppBridge();

  const [email, setEmail] = useState(merchantConfig?.email || userEmail);
  const [paymentMode, setPaymentMode] = useState(merchantConfig?.paymentMode || "freemium");
  const [isProcessing, setIsProcessing] = useState(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [iframeUrl, setIframeUrl] = useState<string>("");

  const isExistingStore = !!merchantConfig;

  const runBuilder = async () => {
    setIsProcessing(true);

    try {
      // Call API to create or update merchant config
      const response = await fetch("/api/merchant/configure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          paymentMode,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to configure merchant");
      }

      const { accessKey } = await response.json();

      // Open builder with accessKey
      const builderUrlWithKey = `${builderUrl}?key=${accessKey}&mode=${paymentMode}`;
      window.open(builderUrlWithKey, "_blank");

      shopify.toast.show("Opening Builder...");
    } catch (error) {
      console.error("Error launching builder:", error);
      shopify.toast.show("Failed to launch builder", { isError: true });
    } finally {
      setIsProcessing(false);
    }
  };

  // Load iframe - with accessKey for existing stores, without for new users (preview mode)
  useEffect(() => {
    if (merchantConfig?.accessKey) {
      // Existing store: load with credentials
      setIframeUrl(`${builderUrl}?key=${merchantConfig.accessKey}`);
    } else {
      // New user: load in preview/demo mode
      setIframeUrl(`${builderUrl}?mode=preview`);
    }
  }, [builderUrl, merchantConfig]);

  return (
    <s-page heading="Mersivx 3D Builder">
      {/* Payment Mode Selection */}
      <s-section heading="Choose Your Plan">
        <s-paragraph>
          Select the plan that works best for your store
        </s-paragraph>

        <s-stack direction="inline" gap="base">
          <s-button
            variant={paymentMode === "freemium" ? "primary" : "secondary"}
            onClick={() => setPaymentMode("freemium")}
          >
            Freemium (Free)
          </s-button>
          <s-button
            variant={paymentMode === "premium" ? "primary" : "secondary"}
            onClick={() => setPaymentMode("premium")}
            disabled
          >
            Premium (Coming Soon)
          </s-button>
        </s-stack>

        {paymentMode === "freemium" && (
          <s-banner tone="info">
            <s-paragraph>
              <strong>Freemium Plan:</strong> Get started for free with basic 3D builder features
            </s-paragraph>
          </s-banner>
        )}
      </s-section>

      {/* Email Configuration */}
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
            <s-paragraph>
              Please enter your email address to continue
            </s-paragraph>
          </s-banner>
        )}
      </s-section>

      {/* Store Status */}
      {isExistingStore && (
        <s-section heading="Store Status">
          <s-banner tone="success">
            <s-paragraph>
              <strong>Store Created:</strong> Your 3D store was created on{" "}
              {new Date(merchantConfig.createdAt).toLocaleDateString()}
            </s-paragraph>
          </s-banner>
        </s-section>
      )}

      {/* Launch Builder - Two Options */}
      <s-section heading="Launch Builder">
        <s-paragraph>
          {isExistingStore
            ? "Choose how to access your 3D store builder:"
            : "Create your immersive 3D shopping experience"
          }
        </s-paragraph>

        <s-stack direction="block" gap="base">
          <div>
            <s-paragraph>
              Continue building your 3d store in a new browser tab
            </s-paragraph>
            <s-button
              onClick={runBuilder}
              variant="primary"
              disabled={!email || isProcessing}
              {...(isProcessing ? { loading: true } : {})}
            >
              {isExistingStore ? "Open in New Tab" : "Create 3D Store"}
            </s-button>
          </div>
        </s-stack>
      </s-section>

      {/* Builder Preview (iframe) - Show for all users */}
      {iframeUrl && (
        <s-section heading={isExistingStore ? "Builder Preview" : "3D Store Preview"}>
          <s-paragraph>
            {isExistingStore
              ? "Interactive builder embedded within the Shopify Admin"
              : "Preview the 3D store builder interface below. Click 'Create 3D Store' above to start building."
            }
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
                style={{
                  width: "100%",
                  height: "100%",
                  border: "none",
                }}
                title="Mersivx Builder Preview"
                onLoad={() => setIframeLoaded(true)}
              />
            </div>
          </s-box>
        </s-section>
      )}

      {/* Sidebar Info */}
      <s-section slot="aside" heading="Store Info">
        <s-paragraph>
          <strong>Store:</strong> {shop}
        </s-paragraph>
        <s-paragraph>
          <strong>Plan:</strong> {paymentMode === "freemium" ? "Freemium" : "Premium"}
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
