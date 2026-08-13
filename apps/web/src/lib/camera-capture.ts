/**
 * Phone cameras hand the browser a JPEG (iOS transcodes HEIC for web inputs),
 * so a tool can take camera input only when it accepts JPEG files. This is a
 * plain module so tests and non-React callers can use it directly.
 */
export function toolAcceptsCameraPhotos(acceptedInputs: readonly string[] | undefined): boolean {
  return acceptedInputs?.some((ext) => ext === ".jpg" || ext === ".jpeg") ?? false;
}
