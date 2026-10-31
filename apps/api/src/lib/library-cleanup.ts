import { deletePreview } from "../routes/file-preview.js";
import { deleteStoredFile, deleteThumbnail } from "./file-storage.js";

/**
 * Remove everything a library file keeps outside its user_files row: the stored
 * object, its thumbnail, and any cached preview. Every path that deletes
 * user_files rows (library delete, GDPR purge, admin user delete, where the FK
 * cascade drops the rows) has to call this first; once the rows are gone
 * nothing points at these objects any more (#1405).
 */
export async function deleteLibraryFileStorage(file: {
  id: string;
  storedName: string;
}): Promise<void> {
  await deleteStoredFile(file.storedName);
  await deleteThumbnail(file.storedName);
  await deletePreview(file.id);
}
