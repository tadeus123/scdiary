import type { AdapterContext, CompanyAgentAdapter, NormalizedAgentInput, NormalizedAgentResult } from "@web-native-agent/core";
export type FunctionAdapterHandler = (input: NormalizedAgentInput, context: AdapterContext) => Promise<NormalizedAgentResult>;
export type FunctionAdapterOptions = {
    name?: string;
    getTask?: CompanyAgentAdapter["getTask"];
    cancelTask?: CompanyAgentAdapter["cancelTask"];
};
export declare function functionAdapter(handler: FunctionAdapterHandler, options?: FunctionAdapterOptions): CompanyAgentAdapter;
//# sourceMappingURL=index.d.ts.map