import type { Message, Part } from "@a2a-js/sdk";
import type { FileReference, NormalizedAgentInput, NormalizedArtifact } from "@web-native-agent/core";
export declare function extractText(message: Message): string;
export declare function extractData(message: Message): Record<string, unknown> | null;
export declare function extractFiles(message: Message): FileReference[];
export declare function messageToNormalizedInput(message: Message, requestedOutputModes?: string[]): NormalizedAgentInput;
export declare function textPart(text: string): Part;
export declare function dataPart(data: Record<string, unknown>, mediaType?: string): Part;
export declare function artifactToParts(artifact: NormalizedArtifact): Part[];
//# sourceMappingURL=mapping.d.ts.map