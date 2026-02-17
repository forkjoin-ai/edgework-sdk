export interface GatewayClient {
  create_chat_completion: (
    request: unknown,
    requestId?: string,
    correlationId?: string
  ) => unknown;
  health_check: () => unknown;
}

declare const init: () => Promise<unknown>;
export default init;
