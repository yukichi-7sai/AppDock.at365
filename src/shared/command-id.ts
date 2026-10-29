/** Stable IDs shared by metadata references, assignment and execution. */
export function validCommandId(id: unknown): id is string {
  return (
    typeof id === 'string' &&
    /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,179}$/.test(id) &&
    !['constructor', 'prototype', '__proto__'].includes(id)
  );
}
