---
description: "एक PDF के हर पृष्ठ पर एक टेक्स्ट वॉटरमार्क जोड़ें।"
i18n_source_hash: f1f7d8912fbd
i18n_provenance: human
i18n_output_hash: fdb76a708248
---

# Watermark PDF {#watermark-pdf}

कॉन्फ़िगर करने योग्य स्थिति, आकार, अपारदर्शिता और घूर्णन के साथ एक PDF के हर पृष्ठ पर एक टेक्स्ट वॉटरमार्क स्टैम्प करें।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/watermark-pdf`

एक PDF फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| text | string | Yes | - | वॉटरमार्क टेक्स्ट (1-200 अक्षर) |
| position | string | No | `"c"` | पृष्ठ पर स्थान: `tl`, `tc`, `tr`, `l`, `c`, `r`, `bl`, `bc`, `br` |
| fontSize | integer | No | `48` | पॉइंट में फ़ॉन्ट आकार (6-72) |
| opacity | number | No | `0.3` | वॉटरमार्क अपारदर्शिता (0.05-1) |
| rotation | number | No | `45` | डिग्री में घूर्णन कोण (-180 से 180) |

### Position Values {#position-values}

- `tl` ऊपर-बाएं, `tc` ऊपर-केंद्र, `tr` ऊपर-दाएं
- `l` केंद्र-बाएं, `c` केंद्र, `r` केंद्र-दाएं
- `bl` नीचे-बाएं, `bc` नीचे-केंद्र, `br` नीचे-दाएं

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/watermark-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"text": "CONFIDENTIAL", "position": "c", "opacity": 0.2, "rotation": 45}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2500000
}
```

## Notes {#notes}

- वॉटरमार्क प्रत्येक पृष्ठ पर एक टेक्स्ट ओवरले के रूप में रेंडर किया जाता है।
- वही वॉटरमार्क टेक्स्ट, स्थिति और शैली सभी पृष्ठों पर समान रूप से लागू की जाती है।
- सामग्री को अस्पष्ट न करने वाले सूक्ष्म वॉटरमार्क के लिए कम अपारदर्शिता मान (0.1-0.3) का उपयोग करें।
