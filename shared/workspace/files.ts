const PREFIX = "AMBITT_FILE_V1\n";
export function packFile(text: string, base64: string) {
  return PREFIX + JSON.stringify({ text, base64 });
}
export function unpackFile(value: string): { text: string; base64?: string } {
  if (!value.startsWith(PREFIX)) return { text: value };
  const data = JSON.parse(value.slice(PREFIX.length));
  if (typeof data.text !== "string" || typeof data.base64 !== "string")
    throw new Error("Invalid file data");
  return data;
}
