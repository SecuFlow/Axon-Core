/**
 * Verkleinert Fotos vor dem Upload (Canvas), um Bandbreite zu sparen.
 * Bei Fehlern wird die Originaldatei zurückgegeben.
 */
export async function compressImageForUpload(
  file: File,
  options?: { maxEdge?: number; quality?: number },
): Promise<File> {
  if (typeof window === "undefined") return file;
  if (!file.type.startsWith("image/")) return file;

  const maxEdge = options?.maxEdge ?? 1920;
  const quality = options?.quality ?? 0.82;

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  try {
    const { width: iw, height: ih } = bitmap;
    if (iw <= 0 || ih <= 0) {
      bitmap.close();
      return file;
    }

    let w = iw;
    let h = ih;
    const longest = Math.max(iw, ih);
    if (longest > maxEdge) {
      const scale = maxEdge / longest;
      w = Math.max(1, Math.round(iw * scale));
      h = Math.max(1, Math.round(ih * scale));
    }

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    bitmap = null;

    const blob: Blob | null = await new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/jpeg", quality);
    });

    if (!blob || blob.size === 0) return file;

    const base =
      file.name.replace(/\.[^.]+$/, "").replace(/[^\w\-]+/g, "_").slice(0, 80) ||
      "foto";
    return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
  } catch {
    if (bitmap) bitmap.close();
    return file;
  }
}
