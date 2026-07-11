---
description: "वीडियो फ्रेम पर एक टेक्स्ट वॉटरमार्क बर्न करें।"
i18n_source_hash: 937bb075b894
i18n_provenance: human
i18n_output_hash: 881eb4df40c2
---

# Watermark Video {#watermark-video}

समायोज्य स्थिति, आकार, अपारदर्शिता, और रंग के साथ किसी वीडियो के हर फ्रेम पर एक टेक्स्ट वॉटरमार्क बर्न करें।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/watermark-video`

एक वीडियो फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| text | string | Yes | - | वॉटरमार्क टेक्स्ट (1-200 वर्ण) |
| position | string | No | `"br"` | फ्रेम पर स्थिति: `tl`, `tc`, `tr`, `l`, `c`, `r`, `bl`, `bc`, `br` |
| fontSize | integer | No | `36` | पिक्सेल में फ़ॉन्ट आकार (8-120) |
| opacity | number | No | `0.5` | वॉटरमार्क अपारदर्शिता (0.05-1) |
| color | string | No | `"#ffffff"` | टेक्स्ट के लिए हेक्स रंग (जैसे `"#ffffff"`) |

### Position Values {#position-values}

- **tl** - ऊपर बाएँ, **tc** - ऊपर मध्य, **tr** - ऊपर दाएँ
- **l** - मध्य बाएँ, **c** - केंद्र, **r** - मध्य दाएँ
- **bl** - नीचे बाएँ, **bc** - नीचे मध्य, **br** - नीचे दाएँ

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/watermark-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"text": "PREVIEW", "position": "c", "fontSize": 48, "opacity": 0.3}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12400000
}
```

## Notes {#notes}

- वॉटरमार्क स्थायी रूप से वीडियो फ्रेम में रेंडर हो जाता है और प्रोसेसिंग के बाद हटाया नहीं जा सकता।
- वॉटरमार्क FFmpeg में निर्मित एक sans-serif फ़ॉन्ट का उपयोग करता है।
- छवि वॉटरमार्क के लिए, इसके बजाय image Watermark टूल का उपयोग करें।
