// A tool that finds nothing in valid input still succeeds, with an empty
// artifact and one of these warnings explaining why (#4923). The integration
// harness accepts a zero-byte download only when the result carries one.
export const NO_SPEECH_DETECTED_WARNING = "No speech was detected in this file.";
export const NO_TEXT_DETECTED_WARNING = "No text was detected in this image.";

export const EMPTY_RESULT_WARNINGS: ReadonlySet<string> = new Set([
  NO_SPEECH_DETECTED_WARNING,
  NO_TEXT_DETECTED_WARNING,
]);
