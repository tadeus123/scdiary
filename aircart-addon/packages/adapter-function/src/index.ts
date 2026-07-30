import type {
  AdapterContext,
  CompanyAgentAdapter,
  NormalizedAgentInput,
  NormalizedAgentResult,
} from "@web-native-agent/core";

export type FunctionAdapterHandler = (
  input: NormalizedAgentInput,
  context: AdapterContext
) => Promise<NormalizedAgentResult>;

export type FunctionAdapterOptions = {
  name?: string;
  getTask?: CompanyAgentAdapter["getTask"];
  cancelTask?: CompanyAgentAdapter["cancelTask"];
};

export function functionAdapter(
  handler: FunctionAdapterHandler,
  options: FunctionAdapterOptions = {}
): CompanyAgentAdapter {
  return {
    name: options.name ?? "function",
    handleMessage: handler,
    getTask: options.getTask,
    cancelTask: options.cancelTask,
  };
}
