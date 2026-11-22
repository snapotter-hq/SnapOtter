---
description: Combine multiple text or Markdown files into one, in the order you choose.
---

# Merge Text Files {#merge-text}

Combine multiple text or Markdown files into a single file. Files are joined in the order they are uploaded, so reorder them in the file list before running if order matters.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/merge-text`

Accepts multipart form data with two or more text files and an optional `settings` JSON string.

## Parameters {#parameters}

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `separator` | string | `"blank-line"` | What goes between files: `"blank-line"`, `"rule"` (a `---` line), or `"filename-heading"` (each file's name as a heading) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/merge-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@chapter-1.md" \
  -F "file=@chapter-2.md" \
  -F 'settings={"separator":"filename-heading"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.md",
  "originalSize": 8200,
  "processedSize": 8240
}
```

## Notes {#notes}

- Accepts `.txt`, `.md`, `.markdown`, `.csv` and `.log` files, between 2 and 50 per request.
- Every file must be UTF-8 text. A binary or non-UTF-8 file is rejected with its name in the error.
- When every input has the same extension the output keeps it (`merged.md`, `merged.log`). Mixed inputs produce `merged.txt`.
- With `filename-heading`, Markdown output uses `# name.md` headings; plain-text output uses `==> name.txt <==` marker lines.
- Trailing blank lines are trimmed from each file so the separator sits cleanly between documents. A leading byte-order mark is dropped.
- CSV files are joined as plain text. Use [Merge CSVs](./merge-csvs) to combine tables with a single header row.
- `.eml` email files are not supported yet.
