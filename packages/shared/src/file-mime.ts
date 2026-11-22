import { IMAGE_EXT_TO_MIME } from "./image-mime.js";

/**
 * Non-image extensions and their MIME types. The download route, the library
 * and pipeline outputs all read this one table; they kept separate copies
 * before and drifted (#5194).
 */
const FILE_EXT_TO_MIME: Readonly<Record<string, string>> = {
  pdf: "application/pdf",
  zip: "application/zip",
  json: "application/json",
  csv: "text/csv",
  tsv: "text/tab-separated-values",
  txt: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
  html: "text/html",
  htm: "text/html",
  xml: "application/xml",
  yaml: "application/yaml",
  yml: "application/yaml",
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  mkv: "video/x-matroska",
  avi: "video/x-msvideo",
  "3gp": "video/3gpp",
  flv: "video/x-flv",
  wmv: "video/x-ms-wmv",
  mpg: "video/mpeg",
  mpeg: "video/mpeg",
  ts: "video/mp2t",
  mts: "video/mp2t",
  m2ts: "video/mp2t",
  ogv: "video/ogg",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  flac: "audio/flac",
  aac: "audio/aac",
  m4a: "audio/mp4",
  ogg: "audio/ogg",
  opus: "audio/opus",
  wma: "audio/x-ms-wma",
  aiff: "audio/aiff",
  aif: "audio/aiff",
  amr: "audio/amr",
  ac3: "audio/ac3",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  odt: "application/vnd.oasis.opendocument.text",
  rtf: "application/rtf",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  odp: "application/vnd.oasis.opendocument.presentation",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  epub: "application/epub+zip",
  srt: "application/x-subrip",
  vtt: "text/vtt",
};

/** MIME type for a lowercase extension without the dot, or application/octet-stream. */
export function mimeForExt(ext: string): string {
  if (Object.hasOwn(FILE_EXT_TO_MIME, ext)) return FILE_EXT_TO_MIME[ext];
  if (Object.hasOwn(IMAGE_EXT_TO_MIME, ext)) return IMAGE_EXT_TO_MIME[ext];
  return "application/octet-stream";
}
