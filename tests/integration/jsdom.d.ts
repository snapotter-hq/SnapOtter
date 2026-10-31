// jsdom ships no typings and @types/jsdom is not installed; this covers only
// what the pdf-to-word suite uses to parse the generated DOCX XML.
declare module "jsdom" {
  export class JSDOM {
    constructor(html?: string, options?: { contentType?: string; url?: string });
    readonly window: Window & typeof globalThis;
  }
}
