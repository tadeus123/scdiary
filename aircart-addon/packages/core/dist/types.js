export class GatewayError extends Error {
    category;
    details;
    constructor(category, message, details) {
        super(message);
        this.name = "GatewayError";
        this.category = category;
        this.details = details;
    }
}
//# sourceMappingURL=types.js.map