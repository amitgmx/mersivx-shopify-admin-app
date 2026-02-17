import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { createYoga, createSchema } from "graphql-yoga";
import { typeDefs } from "../graphql/schema";
import { resolvers } from "../graphql/resolvers";
import { createContext } from "../graphql/context";

// Create GraphQL Yoga instance
const yoga = createYoga({
  schema: createSchema({
    typeDefs,
    resolvers,
  }),
  landingPage: false,
  graphiql: process.env.NODE_ENV === "development", // Enable GraphiQL in dev
  context: ({ request }) => createContext(request),
});

// Handle both GET (GraphiQL) and POST (GraphQL operations)
export async function loader({ request }: LoaderFunctionArgs) {
  return yoga.handle(request, {});
}

export async function action({ request }: ActionFunctionArgs) {
  return yoga.handle(request, {});
}
