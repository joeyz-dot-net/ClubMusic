const TRACE_STORAGE_KEY = 'clubMusicTraceEvents';
const TRACE_LIMIT = 120;
const MAX_STACK_LINES = 12;

function loadTraceEvents() {
    try {
        const raw = sessionStorage.getItem(TRACE_STORAGE_KEY);
        if (!raw) {
            return [];
        }

        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.warn('[Trace] 读取追踪缓冲失败:', error);
        return [];
    }
}

function persistTraceEvents(events) {
    try {
        sessionStorage.setItem(TRACE_STORAGE_KEY, JSON.stringify(events));
    } catch (error) {
        console.warn('[Trace] 写入追踪缓冲失败:', error);
    }
}

function captureStack() {
    const stack = new Error().stack || '';
    return stack
        .split('\n')
        .slice(2)
        .filter((line) => !line.includes('requestTrace.js'))
        .slice(0, MAX_STACK_LINES)
        .join('\n');
}

function toSerializable(value, depth = 0) {
    if (value == null || typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') {
        return value;
    }

    if (depth >= 2) {
        return '[max-depth]';
    }

    if (value instanceof Error) {
        return {
            name: value.name,
            message: value.message,
        };
    }

    if (value instanceof FormData) {
        return Object.fromEntries(value.entries());
    }

    if (Array.isArray(value)) {
        return value.slice(0, 8).map((item) => toSerializable(item, depth + 1));
    }

    if (typeof value === 'object') {
        const entries = Object.entries(value).slice(0, 16);
        return Object.fromEntries(entries.map(([key, entryValue]) => [key, toSerializable(entryValue, depth + 1)]));
    }

    return String(value);
}

const traceState = {
    events: loadTraceEvents(),
};

function syncTraceGlobals() {
    window.__clubMusicTraceEvents = traceState.events;
    window.__clubMusicTrace = {
        getEvents() {
            return [...traceState.events];
        },
        clear() {
            traceState.events = [];
            persistTraceEvents(traceState.events);
            syncTraceGlobals();
        },
        latest() {
            return traceState.events[traceState.events.length - 1] || null;
        },
    };
}

syncTraceGlobals();

export function recordTrace(type, details = {}, options = {}) {
    const includeStack = options.includeStack !== false;
    const entry = {
        id: `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        at: new Date().toISOString(),
        time: Date.now(),
        type,
        page: `${window.location.pathname}${window.location.search}${window.location.hash}`,
        details: toSerializable(details),
        stack: includeStack ? captureStack() : '',
    };

    traceState.events = [...traceState.events.slice(-(TRACE_LIMIT - 1)), entry];
    persistTraceEvents(traceState.events);
    syncTraceGlobals();
    return entry;
}

export function getTraceEvents() {
    return [...traceState.events];
}