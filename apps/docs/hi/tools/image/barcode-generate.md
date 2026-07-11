---
description: "Code 128, EAN-13, UPC-A, Code 39, ITF-14, और Data Matrix प्रारूपों में बारकोड उत्पन्न करें।"
i18n_source_hash: e84b1df40c7e
i18n_provenance: human
i18n_output_hash: 662d4fa71be5
---

# Barcode Generator {#barcode-generator}

टेक्स्ट इनपुट से बारकोड छवियाँ उत्पन्न करें। Code 128, EAN-13, UPC-A, Code 39, ITF-14, और Data Matrix प्रारूपों का समर्थन करता है।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/barcode-generate`

एक `application/json` बॉडी स्वीकार करता है (multipart नहीं)। बारकोड प्रदान किए गए टेक्स्ट से उत्पन्न होता है, अपलोड की गई फ़ाइल से नहीं।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| text | string | Yes | - | बारकोड में एनकोड करने के लिए टेक्स्ट (1-256 वर्ण) |
| type | string | No | `"code128"` | बारकोड प्रारूप: `code128`, `ean13`, `upca`, `code39`, `itf14`, `datamatrix` |
| scale | integer | No | `3` | छवि स्केल कारक (1-8) |
| includeText | boolean | No | `true` | बारकोड के नीचे टेक्स्ट रेंडर करना है या नहीं |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/barcode-generate \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "5901234123457", "type": "ean13", "scale": 4}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/barcode.png",
  "originalSize": 0,
  "processedSize": 4520
}
```

## Notes {#notes}

- अधिकांश टूल के विपरीत, यह एंडपॉइंट multipart form data नहीं बल्कि एक JSON बॉडी स्वीकार करता है, क्योंकि बारकोड अपलोड की गई फ़ाइल के बजाय टेक्स्ट से उत्पन्न होते हैं।
- EAN-13 के लिए ठीक 12 या 13 अंक आवश्यक हैं। UPC-A के लिए ठीक 11 या 12 अंक आवश्यक हैं। यदि चेक अंक छोड़ दिया जाता है, तो इसकी गणना स्वचालित रूप से की जाती है।
- Code 128 सबसे लचीला प्रारूप है और पूर्ण ASCII वर्ण सेट का समर्थन करता है।
- Data Matrix एक 2D बारकोड उत्पन्न करता है जो लंबी स्ट्रिंग्स को एक सघन वर्ग में एनकोड करने के लिए उपयुक्त है।
