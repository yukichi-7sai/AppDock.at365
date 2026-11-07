/** Outbound HTTP diagnostics are local logs, separate from notifications and API results. */
type ErrorLog = (source: string, message: string) => void;
let errorLog: ErrorLog | undefined;

export function setHttpErrorLog(log: ErrorLog | undefined) {
  errorLog = log;
}

/** Preserve the entire error value, including unknown fields and nested JSON. */
export function logHttpJsonError(source: string, status: number, value: unknown): boolean {
  if (
    !value ||
    typeof value !== 'object' ||
    !Object.hasOwn(value, 'error') ||
    (value as { error: unknown }).error === null
  )
    return false;
  try {
    const json = JSON.stringify((value as { error: unknown }).error);
    if (json === undefined) return false;
    errorLog?.(source, `HTTP ${status}\nresponse.error=${json}`);
  } catch {
    // A diagnostic must never change the request's result or recursively log its own failure.
  }
  return true;
}

/** Also supports transports that already collected a response, such as pinned HTTPS webhooks. */
export function logHttpErrorBody(source: string, status: number, body: string) {
  try {
    if (logHttpJsonError(source, status, JSON.parse(body))) return;
  } catch {
    // Non-JSON bodies (including proxy HTML) are not response.error.
  }
  if (status < 200 || status >= 400) {
    try {
      errorLog?.(source, `HTTP ${status}`);
    } catch {
      // Logging failures must not affect the operation.
    }
  }
}

/** Observe JSON error envelopes in SSE without changing or buffering the complete stream. */
export function httpJsonErrorEvents(source: string, status: number) {
  const decoder = new TextDecoder();
  let pending = '';
  const consume = () => {
    for (;;) {
      const boundary = /\r\n\r\n|\n\n|\r\r/.exec(pending);
      if (!boundary) return;
      const event = pending.slice(0, boundary.index);
      pending = pending.slice(boundary.index + boundary[0].length);
      const data = event
        .split(/\r\n|\n|\r/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).replace(/^ /, ''))
        .join('\n');
      if (data) logHttpErrorBody(source, status, data);
    }
  };
  return {
    write(chunk: Uint8Array) {
      pending += decoder.decode(chunk, { stream: true });
      consume();
    },
    end() {
      pending += decoder.decode();
      consume();
    },
  };
}

/** All host REST/fetch calls go through here, including injected Electron and fixture transports. */
export async function httpFetch<Args extends unknown[]>(
  source: string,
  transport: (...args: Args) => Promise<Response>,
  ...args: Args
): Promise<Response> {
  const response = await transport(...args);
  if (!response.ok && (response.status < 300 || response.status >= 400)) {
    let body = '';
    try {
      // Keep the original response, status, headers and body available to its existing consumer.
      body = await response.clone().text();
    } catch {
      // Aborted, unreadable or absent error bodies still retain the HTTP status.
    }
    logHttpErrorBody(source, response.status, body);
  }
  return response;
}
