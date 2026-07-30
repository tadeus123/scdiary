export function extractText(message) {
    const texts = [];
    for (const part of message.parts ?? []) {
        if (part.content?.$case === "text") {
            texts.push(part.content.value);
        }
    }
    return texts.join("\n").trim();
}
export function extractData(message) {
    for (const part of message.parts ?? []) {
        if (part.content?.$case === "data") {
            const value = part.content.value;
            if (value && typeof value === "object" && !Array.isArray(value)) {
                return value;
            }
        }
    }
    return null;
}
export function extractFiles(message) {
    const files = [];
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
export function messageToNormalizedInput(message, requestedOutputModes = ["text/plain", "application/json"]) {
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
        metadata: message.metadata ?? {},
    };
}
export function textPart(text) {
    return {
        content: { $case: "text", value: text },
        metadata: undefined,
        filename: "",
        mediaType: "text/plain",
    };
}
export function dataPart(data, mediaType = "application/json") {
    return {
        content: { $case: "data", value: data },
        metadata: undefined,
        filename: "",
        mediaType,
    };
}
export function artifactToParts(artifact) {
    const parts = [];
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
//# sourceMappingURL=mapping.js.map