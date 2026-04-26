const VIDEOS_BUCKET = "Videos";

/** Extrahiert den Objektpfad aus der öffentlichen Supabase-Storage-URL. */
export function storageObjectPathFromPublicUrl(
  publicUrl: string,
  bucket: string = VIDEOS_BUCKET,
): string | null {
  const needle = `/object/public/${bucket}/`;
  const i = publicUrl.indexOf(needle);
  if (i === -1) return null;
  return decodeURIComponent(publicUrl.slice(i + needle.length));
}

export { VIDEOS_BUCKET };
