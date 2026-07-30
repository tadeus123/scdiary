import { randomUUID } from "node:crypto";
import {
  type Artifact,
  type Message,
  Role,
  type Task,
  type TaskArtifactUpdateEvent,
  TaskState,
  type TaskStatusUpdateEvent,
} from "@a2a-js/sdk";
import {
  AgentEvent,
  type AgentExecutor,
  type ExecutionEventBus,
  type RequestContext,
} from "@a2a-js/sdk/server";
import type {
  AdapterContext,
  CompanyAgentAdapter,
  NormalizedAgentResult,
} from "@web-native-agent/core";
import { artifactToParts, messageToNormalizedInput, textPart } from "./mapping.js";

function resultState(kind: NormalizedAgentResult["kind"]): TaskState {
  switch (kind) {
    case "submitted":
      return TaskState.TASK_STATE_SUBMITTED;
    case "working":
      return TaskState.TASK_STATE_WORKING;
    case "input_required":
      return TaskState.TASK_STATE_INPUT_REQUIRED;
    case "auth_required":
      return TaskState.TASK_STATE_AUTH_REQUIRED;
    case "completed":
      return TaskState.TASK_STATE_COMPLETED;
    case "rejected":
      return TaskState.TASK_STATE_REJECTED;
    case "failed":
      return TaskState.TASK_STATE_FAILED;
    case "canceled":
      return TaskState.TASK_STATE_CANCELED;
    case "message":
      return TaskState.TASK_STATE_COMPLETED;
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

function agentMessage(
  text: string | undefined,
  taskId: string,
  contextId: string
): Message | undefined {
  if (!text) {
    return undefined;
  }
  return {
    role: Role.ROLE_AGENT,
    messageId: randomUUID(),
    parts: [textPart(text)],
    taskId,
    contextId,
    extensions: [],
    metadata: {},
    referenceTaskIds: [],
  };
}

export class AdapterAgentExecutor implements AgentExecutor {
  private readonly cancelledTasks = new Set<string>();

  constructor(
    private readonly adapter: CompanyAgentAdapter,
    private readonly publicOrigin: string
  ) {}

  cancelTask = async (taskId: string, _eventBus: ExecutionEventBus): Promise<void> => {
    this.cancelledTasks.add(taskId);
    if (this.adapter.cancelTask) {
      const context: AdapterContext = {
        requestId: randomUUID(),
        publicOrigin: this.publicOrigin,
        adapterName: this.adapter.name,
        now: () => new Date(),
      };
      await this.adapter.cancelTask(taskId, context);
    }
  };

  async execute(requestContext: RequestContext, eventBus: ExecutionEventBus): Promise<void> {
    const { userMessage, task: existingTask, taskId, contextId } = requestContext;

    try {
      const taskSnapshot: Task = existingTask ?? {
        id: taskId,
        contextId,
        status: {
          state: TaskState.TASK_STATE_SUBMITTED,
          timestamp: new Date().toISOString(),
          message: undefined,
        },
        artifacts: [],
        history: [userMessage],
        metadata: userMessage.metadata,
      };
      eventBus.publish(AgentEvent.task(taskSnapshot));

      if (this.cancelledTasks.has(taskId)) {
        eventBus.publish(
          AgentEvent.statusUpdate({
            taskId,
            contextId,
            status: {
              state: TaskState.TASK_STATE_CANCELED,
              timestamp: new Date().toISOString(),
              message: undefined,
            },
            metadata: {},
          })
        );
        return;
      }

      const workingUpdate: TaskStatusUpdateEvent = {
        taskId,
        contextId,
        status: {
          state: TaskState.TASK_STATE_WORKING,
          timestamp: new Date().toISOString(),
          message: undefined,
        },
        metadata: {},
      };
      eventBus.publish(AgentEvent.statusUpdate(workingUpdate));

      const adapterContext: AdapterContext = {
        requestId: randomUUID(),
        publicOrigin: this.publicOrigin,
        adapterName: this.adapter.name,
        now: () => new Date(),
      };

      const normalizedInput = messageToNormalizedInput(userMessage);
      if (!normalizedInput.taskId) {
        normalizedInput.taskId = taskId;
      }
      if (!normalizedInput.contextId) {
        normalizedInput.contextId = contextId;
      }

      const result = await this.adapter.handleMessage(normalizedInput, adapterContext);
      const resolvedTaskId = result.taskId ?? taskId;
      const resolvedContextId = result.contextId ?? contextId;

      if (result.kind === "message") {
        const message: Message = {
          role: Role.ROLE_AGENT,
          messageId: randomUUID(),
          parts: [textPart(result.message ?? "")],
          taskId: resolvedTaskId,
          contextId: resolvedContextId,
          extensions: [],
          metadata: result.metadata ?? {},
          referenceTaskIds: [],
        };
        eventBus.publish(AgentEvent.message(message));
        return;
      }

      for (const artifact of result.artifacts ?? []) {
        const a2aArtifact: Artifact = {
          artifactId: randomUUID(),
          name: artifact.name,
          description: artifact.description ?? "",
          parts: artifactToParts(artifact),
          metadata: undefined,
          extensions: [],
        };
        const artifactUpdate: TaskArtifactUpdateEvent = {
          taskId: resolvedTaskId,
          contextId: resolvedContextId,
          artifact: a2aArtifact,
          lastChunk: true,
          append: false,
          metadata: undefined,
        };
        eventBus.publish(AgentEvent.artifactUpdate(artifactUpdate));
      }

      const statusUpdate: TaskStatusUpdateEvent = {
        taskId: resolvedTaskId,
        contextId: resolvedContextId,
        status: {
          state: resultState(result.kind),
          timestamp: new Date().toISOString(),
          message: agentMessage(result.message, resolvedTaskId, resolvedContextId),
        },
        metadata: result.metadata ?? {},
      };
      eventBus.publish(AgentEvent.statusUpdate(statusUpdate));
    } finally {
      this.cancelledTasks.delete(taskId);
    }
  }
}
