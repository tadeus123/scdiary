export type ErrorCategory =
  | "agent_not_found"
  | "invalid_agent_card"
  | "unsupported_protocol"
  | "unsafe_endpoint"
  | "signature_invalid"
  | "authentication_required"
  | "authorization_denied"
  | "input_required"
  | "adapter_timeout"
  | "adapter_unavailable"
  | "rate_limited"
  | "invalid_request"
  | "upstream_error"
  | "internal_error";

export class GatewayError extends Error {
  readonly category: ErrorCategory;
  readonly details?: Record<string, unknown>;

  constructor(category: ErrorCategory, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "GatewayError";
    this.category = category;
    this.details = details;
  }
}

export type FileReference = {
  url: string;
  mediaType?: string;
  filename?: string;
};

export type NormalizedAgentInput = {
  messageId: string;
  taskId?: string;
  contextId?: string;
  text: string;
  data?: Record<string, unknown> | null;
  files: FileReference[];
  principal?: {
    subject: string;
    scheme?: string;
  } | null;
  requestedOutputModes: string[];
  extensions: string[];
  metadata: Record<string, unknown>;
};

export type NormalizedArtifact = {
  name: string;
  description?: string;
  mediaType: string;
  data?: Record<string, unknown>;
  text?: string;
  file?: FileReference;
};

export type NormalizedAgentResultKind =
  | "message"
  | "submitted"
  | "working"
  | "input_required"
  | "auth_required"
  | "completed"
  | "rejected"
  | "failed"
  | "canceled";

export type NormalizedAgentResult = {
  kind: NormalizedAgentResultKind;
  taskId?: string;
  contextId?: string;
  message?: string;
  artifacts?: NormalizedArtifact[];
  errorCategory?: ErrorCategory;
  metadata?: Record<string, unknown>;
};

export type AdapterContext = {
  requestId: string;
  publicOrigin: string;
  adapterName: string;
  now: () => Date;
};

export interface CompanyAgentAdapter {
  readonly name: string;
  handleMessage(
    input: NormalizedAgentInput,
    context: AdapterContext
  ): Promise<NormalizedAgentResult>;
  getTask?(taskId: string, context: AdapterContext): Promise<NormalizedAgentResult>;
  cancelTask?(taskId: string, context: AdapterContext): Promise<NormalizedAgentResult>;
}
