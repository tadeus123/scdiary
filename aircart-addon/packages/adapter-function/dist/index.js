export function functionAdapter(handler, options = {}) {
    return {
        name: options.name ?? "function",
        handleMessage: handler,
        getTask: options.getTask,
        cancelTask: options.cancelTask,
    };
}
//# sourceMappingURL=index.js.map