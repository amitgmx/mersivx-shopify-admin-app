export interface GraphQLContext {
  request: Request;
}

export function createContext(request: Request): GraphQLContext {
  return { request };
}
