export const typeDefs = /* GraphQL */ `
  type MerchantConfig {
    id: ID!
    shop: String!
    accessToken: String!
    apiKey: String!
    builderData: JSON
    createdAt: String!
    updatedAt: String!
  }

  type OneTimeTicket {
    id: ID!
    ticket: String!
    shop: String!
    used: Boolean!
    expiresAt: String!
    createdAt: String!
  }

  type AuthPayload {
    shop: String!
    accessToken: String!
    apiKey: String!
    builderData: JSON
  }

  type TicketPayload {
    ticket: String!
  }

  scalar JSON

  type Query {
    merchantConfig(shop: String!): MerchantConfig
    validateTicket(ticket: String!): Boolean!
  }

  type Mutation {
    # Used by Shopify app afterAuth hook
    syncMerchantCredentials(
      shop: String!
      accessToken: String!
      apiKey: String!
    ): MerchantConfig!

    # Used by Shopify app to create tickets
    createTicket(shop: String!): TicketPayload!

    # Used by external builder to exchange tickets
    exchangeTicket(ticket: String!): AuthPayload!

    # Used by external builder to update builder data
    updateBuilderData(shop: String!, builderData: JSON!): MerchantConfig!

    # Used by uninstall webhook
    deleteMerchantData(shop: String!): Boolean!
  }
`;
