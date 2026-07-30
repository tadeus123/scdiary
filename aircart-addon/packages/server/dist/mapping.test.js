import { describe, expect, it } from "vitest";
import { messageToNormalizedInput, textPart } from "./mapping.js";
import { Role } from "@a2a-js/sdk";
describe("A2A mapping", () => {
    it("maps text and data parts into normalized input", () => {
        const input = messageToNormalizedInput({
            messageId: "msg-1",
            role: Role.ROLE_USER,
            parts: [
                textPart("Hello"),
                {
                    content: { $case: "data", value: { quantity: 10 } },
                    metadata: undefined,
                    filename: "",
                    mediaType: "application/json",
                },
            ],
            taskId: "task-1",
            contextId: "ctx-1",
            extensions: [],
            metadata: {},
            referenceTaskIds: [],
        });
        expect(input.text).toBe("Hello");
        expect(input.data).toEqual({ quantity: 10 });
        expect(input.taskId).toBe("task-1");
    });
});
//# sourceMappingURL=mapping.test.js.map