---
description: "DDColor AI मॉडल के साथ श्वेत-श्याम या ग्रेस्केल तस्वीरों को स्वचालित रूप से रंगीन करें।"
i18n_source_hash: 688aa3abbdae
i18n_provenance: human
i18n_output_hash: d52b65484357
---

# AI Colorization {#ai-colorization}

AI (OpenCV DNN फ़ॉलबैक के साथ DDColor मॉडल) का उपयोग करके श्वेत-श्याम या ग्रेस्केल तस्वीरों को पूर्ण रंग में परिवर्तित करें।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/colorize`

**Processing:** अतुल्यकालिक (202 लौटाता है, SSE के माध्यम से स्थिति के लिए `/api/v1/jobs/{jobId}/progress` पर पोल करें)

**Model bundle:** `object-eraser-colorize` (1-2 GB)

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | छवि फ़ाइल (मल्टीपार्ट) |
| intensity | number | No | `1.0` | रंग तीव्रता (0-1)। कम मान अधिक सूक्ष्म रंगीनीकरण उत्पन्न करते हैं |
| model | string | No | `"auto"` | उपयोग करने के लिए मॉडल: `auto`, `ddcolor`, `opencv` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/colorize \
  -F "file=@old-bw-photo.jpg" \
  -F 'settings={"intensity":0.9,"model":"auto"}'
```

## Response {#response}

### Initial Response (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Progress (SSE at `/api/v1/jobs/{jobId}/progress`) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Colorizing...","percent":55}
```

### Final Result (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/old-bw-photo_colorized.jpg",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 180000,
    "processedSize": 210000,
    "width": 1920,
    "height": 1080,
    "method": "ddcolor"
  }
}
```

## Notes {#notes}

- `object-eraser-colorize` मॉडल बंडल का स्थापित होना आवश्यक है (1-2 GB)।
- DDColor उच्च गुणवत्ता वाले परिणाम उत्पन्न करता है लेकिन धीमा है; OpenCV DNN थोड़ी कम गुणवत्ता के साथ तेज़ है। `auto` उपलब्ध होने पर DDColor का उपयोग करता है और OpenCV फ़ॉलबैक के साथ।
- `intensity` पैरामीटर मूल ग्रेस्केल और AI-रंगीन परिणाम के बीच मिश्रण करता है। पूर्ण रंग के लिए 1.0 का उपयोग करें, आंशिक रूप से असंतृप्त विंटेज लुक के लिए कम मान।
- आउटपुट फ़ॉर्मेट स्वचालित रूप से इनपुट फ़ॉर्मेट से मेल खाता है।
- गैर-ब्राउज़र-पूर्वावलोकन योग्य आउटपुट फ़ॉर्मेट के लिए, मुख्य आउटपुट के साथ एक WebP पूर्वावलोकन उत्पन्न किया जाता है।
- स्वचालित डिकोडिंग के माध्यम से HEIC/HEIF, RAW, TGA, PSD, EXR, और HDR इनपुट फ़ॉर्मेट का समर्थन करता है।
