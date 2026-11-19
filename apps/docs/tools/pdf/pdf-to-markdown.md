---
description: Convert a PDF to Markdown, keeping headings, lists and tables where the PDF has them.
---

# PDF to Markdown {#pdf-to-markdown}

Turn a PDF into a Markdown file you can drop into a wiki, a static site, or an LLM pipeline.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-markdown`

Accepts multipart form data with a PDF file.

## Parameters {#parameters}

This tool has no configurable parameters. Upload a PDF and get a `.md` file back.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-markdown \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/report.md",
  "originalSize": 520000,
  "processedSize": 14300,
  "chars": 14300
}
```

A large PDF can take longer than the sync window. The API then answers `202` with a `jobId`, and you follow progress at `/api/v1/jobs/{jobId}/progress`.

## What gets kept {#what-gets-kept}

A PDF stores positioned text, not structure, so the converter infers it:

- **Headings.** Short lines set clearly larger than the body text become `#` to `######` headings, ranked by size across the whole document.
- **Lists.** Lines that start with a bullet or a number become list items.
- **Bold, italic and links.** Kept inline. Only `http`, `https` and `mailto` links survive.
- **Tables.** Tables drawn with ruling lines come out as Markdown tables. Tables laid out with spacing alone usually come through as plain paragraphs.

Images are dropped. Multi-column layouts and unusual page designs are best-effort, so check the output before you rely on it.

## Notes {#notes}

- Accepted input format: `.pdf`.
- The `chars` field in the response is the length of the Markdown output.
- A scanned PDF has no text layer to convert. The tool refuses it with `422` and the code `NO_TEXT_LAYER` instead of returning an empty file. Use the [PDF OCR](./ocr-pdf) tool for those.
- For the round trip, [Markdown to PDF](../files/markdown-to-pdf), [Markdown to DOCX](../files/markdown-to-docx) and [Markdown to HTML](../files/markdown-to-html) read `.md` files.
