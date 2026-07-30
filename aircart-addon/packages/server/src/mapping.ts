import type { Message, Part } from "@a2a-js/sdk";
import type {
  FileReference,
  NormalizedAgentInput,
  NormalizedArtifact,
} from "@web-native-agent/core";

export function extractText(message: Message): string {
  const texts: string[] = [];
  for (const part of message.parts ?? []) {
    if (part.content?.$case === "text") {
      texts.push(part.content.value);
    }
  }
  return texts.join("\n").trim();
}

export function extractData(message: Message): Record<string, unknown> | null {
  for (const part of message.parts ?? []) {
    if (part.content?.$case === "data") {
      const value = part.content.value;
      if (value && typeof value === "object" && !Array.isArray(value)) {
        return value as Record<string, unknown>;
      }
    }
  }
  return null;
}

export function extractFiles(message: Message): FileReference[] {
  const files: FileReference[] = [];
  for (const part of message.parts ?? []) {
    if (part.content?.$case === "url") {
      files.push({
        url: part.content.value,
        mediaType: part.mediaType || undefined,
        filename: part.filename || undefined,
      });
    }
  }
  return files;
}

export function messageToNormalizedInput(
  message: Message,
  requestedOutputModes: string[] = ["text/plain", "application/json"]
): NormalizedAgentInput {
  return {
    messageId: message.messageId,
    taskId: message.taskId || undefined,
    contextId: message.contextId || undefined,
    text: extractText(message),
    data: extractData(message),
    files: extractFiles(message),
    principal: null,
    requestedOutputModes,
    extensions: message.extensions ?? [],
    metadata: (message.metadata as Record<string, unknown>) ?? {},
  };
}

export function textPart(text: string): Part {
  return {
    content: { $case: "text", value: text },
    metadata: undefined,
    filename: "",
    mediaType: "text/plain",
  };
}

export function dataPart(data: Record<string, unknown>, mediaType = "application/json"): Part {
  return {
    content: { $case: "data", value: data },
    metadata: undefined,
    filename: "",
    mediaType,
  };
}

export function artifactToParts(artifact: NormalizedArtifact): Part[] {
  const parts: Part[] = [];
  if (artifact.text) {
    parts.push(textPart(artifact.text));
  }
  if (artifact.data) {
    parts.push(dataPart(artifact.data, artifact.mediaType || "application/json"));
  }
  if (artifact.file) {
    parts.push({
      content: { $case: "url", value: artifact.file.url },
      metadata: undefined,
      filename: artifact.file.filename ?? "",
      mediaType: artifact.file.mediaType ?? "application/octet-stream",
    });
  }
  if (parts.length === 0 && artifact.data === undefined && artifact.text === undefined) {
    parts.push(textPart(artifact.name));
  }
  return parts;
}
