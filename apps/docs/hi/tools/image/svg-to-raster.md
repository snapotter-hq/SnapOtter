---
description: "बैच समर्थन के साथ, कस्टम रिज़ॉल्यूशन और DPI पर SVG फ़ाइलों को PNG, JPEG, WebP, AVIF, TIFF, GIF, HEIF, या JXL में बदलें।"
i18n_source_hash: cf36830f8797
i18n_provenance: human
i18n_output_hash: 21a3f7b50714
---

# SVG to Raster {#svg-to-raster}

कस्टम रिज़ॉल्यूशन और DPI पर SVG फ़ाइलों को रास्टर छवि फ़ॉर्मेट (PNG, JPEG, WebP, AVIF, TIFF, GIF, HEIF, या JXL) में बदलें। कई SVG के बैच रूपांतरण का भी समर्थन करता है।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/svg-to-raster`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| width | integer | No | - | पिक्सेल में लक्ष्य चौड़ाई (1 से 65536)। यदि केवल एक आयाम सेट है तो आस्पेक्ट रेशियो बनाए रखता है। |
| height | integer | No | - | पिक्सेल में लक्ष्य ऊँचाई (1 से 65536)। यदि केवल एक आयाम सेट है तो आस्पेक्ट रेशियो बनाए रखता है। |
| dpi | integer | No | 300 | रेंडर DPI, आधार रास्टराइज़ेशन घनत्व को नियंत्रित करता है (36 से 2400) |
| quality | number | No | 90 | लॉसी फ़ॉर्मेट के लिए आउटपुट गुणवत्ता (1 से 100) |
| backgroundColor | string | No | `"#00000000"` | हेक्स के रूप में बैकग्राउंड रंग (6 या 8 वर्ण, 8-वर्ण में अल्फ़ा शामिल है) |
| outputFormat | string | No | `"png"` | आउटपुट फ़ॉर्मेट: `png`, `jpg`, `webp`, `avif`, `tiff`, `gif`, `heif`, `jxl` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/svg-to-raster \
  -F "file=@logo.svg" \
  -F 'settings={"width":1024,"dpi":300,"outputFormat":"png","backgroundColor":"#FFFFFF"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/logo.png",
  "previewUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/preview.webp",
  "originalSize": 12345,
  "processedSize": 67890
}
```

## Batch Endpoint {#batch-endpoint}

`POST /api/v1/tools/image/svg-to-raster/batch`

एक अनुरोध में कई SVG फ़ाइलों को बदलें। एक ZIP आर्काइव लौटाता है।

### Additional Batch Parameters {#additional-batch-parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| clientJobId | string | No | - | प्रगति ट्रैकिंग के लिए वैकल्पिक क्लाइंट-प्रदत्त जॉब ID (अधिकतम 128 वर्ण) |

### Batch Example Request {#batch-example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/svg-to-raster/batch \
  -F "file=@icon1.svg" \
  -F "file=@icon2.svg" \
  -F "file=@icon3.svg" \
  -F 'settings={"width":512,"outputFormat":"png","dpi":150}'
```

### Batch Response {#batch-response}

बैच एंडपॉइंट हेडर के साथ सीधे एक ZIP फ़ाइल स्ट्रीम करता है:
- `Content-Type: application/zip`
- `X-Job-Id: <jobId>`
- `X-File-Results: <url-encoded JSON mapping of index to filename>`

## Notes {#notes}

- केवल SVG और SVGZ फ़ाइलें स्वीकार करता है (केवल एक्सटेंशन नहीं, बल्कि कंटेंट को मान्य करता है)। SVGZ स्वचालित रूप से डीकम्प्रेस हो जाता है।
- XSS और बाहरी संसाधन लोडिंग को रोकने के लिए रेंडरिंग से पहले SVG कंटेंट को सैनिटाइज़ किया जाता है।
- `dpi` सेटिंग उस घनत्व को नियंत्रित करती है जिस पर SVG को रास्टराइज़ किया जाता है। उच्च DPI उसी SVG व्यूपोर्ट से बड़े पिक्सेल आयाम उत्पन्न करता है।
- जब `width` और `height` दोनों प्रदान किए जाते हैं, तो छवि को `fit: inside` का उपयोग करके आकार बदला जाता है (सीमाओं के भीतर आस्पेक्ट रेशियो बनाए रखता है)।
- उन फ़ॉर्मेट के लिए जिन्हें ब्राउज़र मूल रूप से प्रदर्शित नहीं कर सकते (TIFF, HEIF), प्रतिक्रिया में एक `previewUrl` शामिल किया जाता है। पूर्वावलोकन एक 1200px WebP थंबनेल है।
- डिफ़ॉल्ट बैकग्राउंड `#00000000` पूरी तरह पारदर्शी है। सफ़ेद बैकग्राउंड के लिए `#FFFFFF` पर सेट करें (JPEG आउटपुट के साथ उपयोगी जो पारदर्शिता का समर्थन नहीं करता)।
- बैच प्रोसेसिंग `MAX_BATCH_SIZE` सर्वर कॉन्फ़िगरेशन का सम्मान करती है और प्रदर्शन के लिए समवर्ती वर्कर्स का उपयोग करती है।
- बैच ऑपरेशन की प्रगति को `/api/v1/jobs/:jobId/progress` पर SSE के माध्यम से ट्रैक किया जा सकता है।
