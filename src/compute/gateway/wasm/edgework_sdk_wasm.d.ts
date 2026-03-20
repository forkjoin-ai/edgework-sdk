declare const init: () => Promise<void> | void;

export default init;

export class GatewayClient {
  constructor(basePath: string, token: string);
  create_chat_completion(
    request: unknown,
    requestId?: string,
    correlationId?: string
  ): unknown;
  health_check(): unknown;
}
