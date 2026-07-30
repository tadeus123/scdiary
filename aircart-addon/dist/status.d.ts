export type AirCartStatus = {
    product: string;
    website: string;
    summary: string;
    nowDoing: string;
    focus: string[];
    nextUp: string[];
    updatedAt: string;
    contact: string;
};
/** Edit this object (or overwrite via POST /agent/status) to change what AirCart reports. */
export declare const defaultStatus: AirCartStatus;
export declare function getStatus(): AirCartStatus;
export declare function setStatus(patch: Partial<AirCartStatus>): AirCartStatus;
//# sourceMappingURL=status.d.ts.map