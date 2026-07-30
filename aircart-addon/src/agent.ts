import { randomUUID } from "node:crypto";
import type { NormalizedAgentInput, NormalizedAgentResult } from "@web-native-agent/core";
import { getStatus, type AirCartStatus } from "./status.js";

function wantsStatus(text: string): boolean {
  return /what.*(doing|working|status|up to)|right now|currently|aircart|who are you|what is this/i.test(
    text
  );
}

function formatStatus(status: AirCartStatus): string {
  return [
    `I'm the ${status.product} agent for ${status.website}.`,
    status.summary,
    `Right now: ${status.nowDoing}`,
    `Current focus: ${status.focus.join("; ")}.`,
    `Next up: ${status.nextUp.join("; ")}.`,
    `Status updated at ${status.updatedAt}.`,
  ].join(" ");
}

export function createAirCartAgent() {
  return async (input: NormalizedAgentInput): Promise<NormalizedAgentResult> => {
    const taskId = input.taskId ?? randomUUID();
    const contextId = input.contextId ?? randomUUID();
    const text = input.text.trim();
    const status = getStatus();

    if (!text) {
      return {
        kind: "input_required",
        taskId,
        contextId,
        message:
          "Ask me what AirCart is doing right now, what the product is, or how to connect an agent to tademehl.com.",
      };
    }

    if (wantsStatus(text) || /hello|hi\b|hey\b/i.test(text)) {
      return {
        kind: "completed",
        taskId,
        contextId,
        message: formatStatus(status),
        artifacts: [
          {
            name: "AirCart status",
            mediaType: "application/json",
            data: status as unknown as Record<string, unknown>,
          },
        ],
      };
    }

    if (/how (do i|to) (install|connect|add|setup|set up)/i.test(text)) {
      return {
        kind: "completed",
        taskId,
        contextId,
        message:
          "To put AirCart on your website: 1) run the aircart-agent (or gateway) on a host, 2) reverse-proxy /.well-known/agent-card.json, /a2a/v1, and /agent to that host on tademehl.com, 3) add the HTML discovery link from USER_GUIDE.md, 4) point your company agent via function adapter or signed webhook. Full steps are in USER_GUIDE.md.",
      };
    }

    if (/chatgpt|prompt/i.test(text)) {
      return {
        kind: "completed",
        taskId,
        contextId,
        message:
          "ChatGPT does not automatically probe every website for an Agent Card yet. Give it an explicit prompt to open https://tademehl.com/.well-known/agent-card.json and https://tademehl.com/agent, then ask what AirCart is doing. For a full A2A conversation, use the web-agent CLI or an A2A-capable client. Copy the prompt from USER_GUIDE.md.",
      };
    }

    return {
      kind: "completed",
      taskId,
      contextId,
      message: `${formatStatus(status)} If you want something more specific, ask about status, install steps, or the ChatGPT prompt.`,
      artifacts: [
        {
          name: "AirCart status",
          mediaType: "application/json",
          data: status as unknown as Record<string, unknown>,
        },
      ],
    };
  };
}
