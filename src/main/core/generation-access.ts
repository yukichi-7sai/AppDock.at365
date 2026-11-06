/** Ownership is issued by the host, never taken from tool arguments. */
export function generationMcpOrigin(owner: string) {
  return owner === 'mcp' || owner.startsWith('mcp:') || owner.includes('|mcp:');
}
export function generationConnectionAllowed(owner: string, connection?: { mcpEnabled?: boolean }) {
  return !generationMcpOrigin(owner) || connection?.mcpEnabled === true;
}

export function generationConfigurationSignature(value: unknown) {
  const strip = (c: any) => {
    if (!c) return c;
    const { mcpEnabled: _grant, ...rest } = c;
    return rest;
  };
  const v = value as any;
  return JSON.stringify(
    v?.connections ? { ...v, connections: v.connections.map(strip) } : strip(v),
  );
}
