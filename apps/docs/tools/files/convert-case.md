---
description: Change text to UPPER, lower, Title, Sentence case and more.
---

# Convert Case {#convert-case}

Paste text, pick a case, and copy the result. The text goes to your own SnapOtter server and nowhere else.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/convert-case`

Accepts a JSON body, not multipart form data, and answers with the converted text instead of a file to download.

## Parameters {#parameters}

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `text` | string | (required) | Text to convert. Up to 1,000,000 characters. |
| `mode` | string | (required) | One of the modes below. |
| `locale` | string | (none) | BCP 47 language tag, such as `tr` or `de`, for letters whose case depends on the language. Without it, casing is the same for every language. |

| Mode | Input | Output |
|------|-------|--------|
| `upper` | `The quick brown fox` | `THE QUICK BROWN FOX` |
| `lower` | `The Quick Brown Fox` | `the quick brown fox` |
| `sentence` | `the quick BROWN fox. it jumps.` | `The quick brown fox. It jumps.` |
| `title` | `the lord of the rings` | `The Lord of the Rings` |
| `capitalized` | `the lord of the rings` | `The Lord Of The Rings` |
| `inverse` | `The Quick Brown Fox` | `tHE qUICK bROWN fOX` |
| `alternating` | `the quick brown fox` | `tHe QuIcK bRoWn FoX` |
| `camel` | `The quick brown fox` | `theQuickBrownFox` |
| `pascal` | `the quick brown fox` | `TheQuickBrownFox` |
| `snake` | `The quick brown fox` | `the_quick_brown_fox` |
| `kebab` | `The quick brown fox` | `the-quick-brown-fox` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-case \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "the lord of the rings", "mode": "title"}'
```

## Example Response {#example-response}

```json
{
  "mode": "title",
  "result": "The Lord of the Rings"
}
```

## Notes {#notes}

- `title` keeps short English words (a, an, and, of, the, to and similar) lowercase unless they start or end the line. `capitalized` capitalizes every word.
- `sentence` starts a new sentence at the beginning of the text, after a line break, and after `.`, `!`, `?` or `…` followed by a space, so the dot in `snapotter.com` or `3.5` doesn't count.
- `camel`, `pascal`, `snake` and `kebab` split on spaces, punctuation and existing case changes (`XMLHttpRequest` becomes `xml_http_request`), and convert each line on its own.
- With `locale` set to `tr`, `i` upper-cases to `İ` and `I` lower-cases to `ı`. German `ß` upper-cases to `SS` in every locale.
- The web app sends its current interface language as `locale`.
