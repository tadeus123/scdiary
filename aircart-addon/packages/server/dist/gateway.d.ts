import { type AgentCard } from "@a2a-js/sdk";
import { DefaultRequestHandler, type TaskStore } from "@a2a-js/sdk/server";
import type { CompanyAgentAdapter } from "@web-native-agent/core";
import { type Express } from "express";
export type CreateAgentGatewayOptions = {
    card: AgentCard;
    adapter: CompanyAgentAdapter;
    publicOrigin: string;
    a2aBasePath?: string;
    taskStore?: TaskStore;
    includeDocsPage?: boolean;
};
export type AgentGateway = {
    app: Express;
    card: AgentCard;
    requestHandler: DefaultRequestHandler;
    a2aBasePath: string;
    agentCardPath: string;
};
export declare function createAgentGateway(options: CreateAgentGatewayOptions): AgentGateway;
//# sourceMappingURL=gateway.d.ts.map