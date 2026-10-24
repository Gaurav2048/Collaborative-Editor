export type UploadedAsset = {
  url: string;
  name: string;
  width?: number;
  height?: number;
};
export async function uploadAsset(
  file: File,
  kind: "image" | "source" = "image",
): Promise<UploadedAsset> {
  const data = new FormData();
  data.append("file", file);
  const response = await fetch(`/api/uploads/${kind}`, {
    method: "POST",
    body: data,
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Upload failed.");
  return body;
}
