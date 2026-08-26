import { apiRequest } from "./client";

export async function downloadBlob(path: string, filename: string): Promise<void> {
  const blob = await apiRequest<Blob>(path);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
