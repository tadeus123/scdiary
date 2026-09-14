const { newId, nowIso, hrNow } = require('./util');

function createTracer(store) {
  async function startTrace({ userId, toolName, meta }) {
    const startedHr = hrNow();
    const startedAt = nowIso();
    const trace = await store.insertTrace({
      trace_id: newId(),
      user_id: userId || null,
      tool_name: toolName || '',
      status: 'running',
      started_at: startedAt,
      meta: meta || {},
    });
    return { ...trace, _startedHr: startedHr };
  }

  async function endTrace(trace, { status, meta } = {}) {
    const endedHr = hrNow();
    const durationMs = Number((endedHr - (trace._startedHr || endedHr)).toFixed(3));
    return store.updateTrace(trace.trace_id, {
      status: status || 'ok',
      ended_at: nowIso(),
      duration_ms: durationMs,
      meta: { ...(trace.meta || {}), ...(meta || {}) },
    });
  }

  async function startSpan(trace, name, { parentSpanId, meta } = {}) {
    const startedHr = hrNow();
    const span = await store.insertSpan({
      span_id: newId(),
      trace_id: trace.trace_id,
      parent_span_id: parentSpanId || null,
      name,
      started_at: nowIso(),
      meta: meta || {},
    });
    return { ...span, _startedHr: startedHr };
  }

  async function endSpan(span, { meta, error } = {}) {
    const endedHr = hrNow();
    const durationMs = Number((endedHr - (span._startedHr || endedHr)).toFixed(3));
    return store.updateSpan(span.span_id, {
      ended_at: nowIso(),
      duration_ms: durationMs,
      meta: { ...(span.meta || {}), ...(meta || {}) },
      error: error ? String(error.message || error) : null,
    });
  }

  async function timed(trace, name, fn, opts = {}) {
    const span = await startSpan(trace, name, opts);
    try {
      const result = await fn(span);
      await endSpan(span);
      return result;
    } catch (error) {
      await endSpan(span, { error });
      throw error;
    }
  }

  async function getTraceBundle(traceId) {
    const trace = await store.getTrace(traceId);
    if (!trace) return null;
    const spanRows = await store.listSpans(traceId);
    return {
      trace,
      spans: spanRows,
      total_ms: trace.duration_ms,
    };
  }

  return {
    startTrace,
    endTrace,
    startSpan,
    endSpan,
    timed,
    getTraceBundle,
  };
}

module.exports = { createTracer };
