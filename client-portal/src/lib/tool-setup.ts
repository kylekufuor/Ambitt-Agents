/** Match configured custom tools to their own credential record, as Oracle does. */
export function missingCustomTools(raw: unknown, credentials: Array<{ toolName: string }>): number {
  const connected = new Set(credentials.map(credential => credential.toolName));
  const configured = new Set<string>();
  if (Array.isArray(raw)) for (const tool of raw) {
    if (tool && typeof tool === "object" && typeof tool.name === "string" && tool.name.trim()) configured.add(tool.name);
  }
  return [...configured].filter(name => !connected.has(name)).length;
}
