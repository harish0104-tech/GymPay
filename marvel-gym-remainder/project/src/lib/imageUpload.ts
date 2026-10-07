export const MAX_IMAGE_UPLOAD_BYTES = 5 * 1024 * 1024;
export const IMAGE_SIZE_ERROR = 'Images must be under 5 MB. Uploads above 5 MB aren’t allowed.';

export function validateImageUpload(file: File): string | null {
  if (!file.type.startsWith('image/')) return 'Please select an image file.';
  if (file.size > MAX_IMAGE_UPLOAD_BYTES) return IMAGE_SIZE_ERROR;
  return null;
}
