---
description: Encode text to Base64 or decode Base64 back to text.
---

# Base64 Encode / Decode {#base64}

Paste text to get Base64, or paste Base64 to get the text back, then copy the result. The text goes to your own SnapOtter server and nowhere else.

To turn an image into Base64, use [Image to Base64](/tools/image/image-to-base64) instead.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/base64`

Accepts a JSON body, not multipart form data, and answers with the converted text instead of a file to download.

## Parameters {#parameters}

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `text` | string | (required) | Text to encode, or Base64 to decode. Up to 1,000,000 characters. |
| `mode` | string | (required) | `encode` or `decode`. |
| `urlSafe` | boolean | `false` | When encoding, use the URL-safe alphabet (`-` and `_`) and drop the `=` padding. Ignored when decoding. |

## Example Request {#example-request}

Encode:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello, World!", "mode": "encode"}'
```

Decode:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "SGVsbG8sIFdvcmxkIQ==", "mode": "decode"}'
```

## Example Response {#example-response}

```json
{
  "mode": "encode",
  "result": "SGVsbG8sIFdvcmxkIQ=="
}
```

## Notes {#notes}

- Text is encoded as UTF-8, so accented letters, CJK and emoji round-trip intact.
- Decoding ignores spaces and line breaks, so Base64 wrapped at 76 columns (email, PEM bodies) decodes as pasted.
- Decoding accepts input with or without `=` padding, in either the standard (`+`, `/`) or the URL-safe (`-`, `_`) alphabet, but not a mix of the two.
- Input that isn't Base64 fails with a 400 and the code `ENCODED_TEXT_INVALID`. Valid Base64 that decodes to binary data (an image, a ZIP) rather than UTF-8 text fails with `DECODED_DATA_NOT_TEXT`.
