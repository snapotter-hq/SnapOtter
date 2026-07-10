---
description: "एनोटेट किए गए आउटपुट के साथ QR कोड, बारकोड, और 2D कोड के लिए छवियाँ स्कैन करें।"
i18n_source_hash: 97c9d395c257
i18n_provenance: human
i18n_output_hash: 90b11a4e02c4
---

# Barcode Reader {#barcode-reader}

अपलोड की गई छवियों को सभी प्रकार के बारकोड और QR कोड के लिए स्कैन करें। प्रत्येक पहचाने गए कोड के लिए डिकोड किया गया टेक्स्ट, बारकोड प्रकार, और स्थिति डेटा लौटाता है। पहचाने गए कोड के चारों ओर रंगीन बाउंडिंग बॉक्स के साथ एक एनोटेट की गई छवि भी उत्पन्न करता है।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/barcode-read`

एक छवि फ़ाइल और एक वैकल्पिक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| tryHarder | boolean | No | `true` | कठिन-पढ़ने वाले बारकोड के लिए आक्रामक स्कैनिंग मोड सक्षम करें (धीमा लेकिन अधिक गहन) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/barcode-read \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@receipt.jpg" \
  -F 'settings={"tryHarder": true}'
```

## Example Response {#example-response}

```json
{
  "filename": "receipt.jpg",
  "barcodes": [
    {
      "type": "QRCode",
      "text": "https://example.com/product/123",
      "position": {
        "topLeft": { "x": 100, "y": 50 },
        "topRight": { "x": 250, "y": 50 },
        "bottomLeft": { "x": 100, "y": 200 },
        "bottomRight": { "x": 250, "y": 200 }
      }
    },
    {
      "type": "EAN-13",
      "text": "5901234123457",
      "position": {
        "topLeft": { "x": 50, "y": 400 },
        "topRight": { "x": 300, "y": 400 },
        "bottomLeft": { "x": 50, "y": 450 },
        "bottomRight": { "x": 300, "y": 450 }
      }
    }
  ],
  "annotatedUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/annotated-receipt.png",
  "previewUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/annotated-receipt.png"
}
```

## Response Fields {#response-fields}

| Field | Type | Description |
|-------|------|-------------|
| filename | string | मूल फ़ाइल नाम |
| barcodes | array | पहचाने गए बारकोड ऑब्जेक्ट्स की सरणी |
| annotatedUrl | string or null | एनोटेट की गई छवि डाउनलोड करने का URL (कोई बारकोड न मिलने पर null) |
| previewUrl | string or null | annotatedUrl के समान (फ्रंटएंड पूर्वावलोकन संगतता के लिए) |

### Barcode Object {#barcode-object}

| Field | Type | Description |
|-------|------|-------------|
| type | string | बारकोड प्रारूप (QRCode, EAN-13, Code128, DataMatrix, PDF417, आदि) |
| text | string | बारकोड की डिकोड की गई सामग्री |
| position | object | topLeft, topRight, bottomLeft, bottomRight निर्देशांक के साथ बाउंडिंग बॉक्स |

## Supported Barcode Types {#supported-barcode-types}

1D बारकोड: Code128, Code39, Code93, Codabar, EAN-8, EAN-13, ITF, UPC-A, UPC-E

2D बारकोड: QRCode, DataMatrix, PDF417, Aztec, MaxiCode

## Notes {#notes}

- बारकोड पहचान के लिए zxing-wasm लाइब्रेरी का उपयोग करता है।
- एनोटेट की गई छवि प्रत्येक पहचाने गए बारकोड पर रंगीन बहुभुज बाउंडिंग बॉक्स और क्रमांकित लेबल ओवरले करती है।
- एक ही छवि में 255 तक बारकोड पहचाने जा सकते हैं।
- यदि कोई बारकोड नहीं मिलता है, तो `barcodes` एक खाली सरणी होती है और `annotatedUrl` null होता है।
- `tryHarder` मोड प्रोसेसिंग समय की कीमत पर अधिक गहन स्कैनिंग करता है। साफ़, अच्छी तरह संरेखित बारकोड की तेज़ प्रोसेसिंग के लिए इसे अक्षम करें।
- एनोटेट किया गया आउटपुट हमेशा PNG प्रारूप में होता है।
- HEIC, RAW, PSD, और SVG इनपुट को स्कैन करने से पहले स्वचालित रूप से डिकोड किया जाता है।
- प्रोसेसिंग से पहले EXIF ओरिएंटेशन स्वतः लागू किया जाता है।
