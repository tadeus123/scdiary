import { type AgentExecutor, type ExecutionEventBus, type RequestContext } from "@a2a-js/sdk/server";
import type { CompanyAgentAdapter } from "@web-native-agent/core";
export declare class AdapterAgentExecutor implements AgentExecutor {
    private readonly adapter;
    private readonly publicOrigin;
    private readonly cancelledTasks;
    constructor(adapter: CompanyAgentAdapter, publicOrigin: string);
    cancelTask: (taskId: string, _eventBus: ExecutionEventBus) => Promise<void>;
    execute(requestContext: RequestContext, eventBus: ExecutionEventBus): Promise<void>;
}
//# sourceMappingURL=executor.d.ts.map