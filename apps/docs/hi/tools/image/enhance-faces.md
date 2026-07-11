---
description: "GFPGAN और CodeFormer AI मॉडल के साथ छवियों में धुंधले या निम्न-गुणवत्ता वाले चेहरों को पुनर्स्थापित और तीक्ष्ण करें।"
i18n_source_hash: 7f9f6af8ebda
i18n_provenance: human
i18n_output_hash: c7299bb94d61
---

# Face Enhancement {#face-enhancement}

AI मॉडल (GFPGAN/CodeFormer) का उपयोग करके छवियों में चेहरों को पुनर्स्थापित और उन्नत करें।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/enhance-faces`

**Processing:** अतुल्यकालिक (202 लौटाता है, SSE के माध्यम से स्थिति के लिए `/api/v1/jobs/{jobId}/progress` पर पोल करें)

**Model bundles:** `upscale-enhance` (5-6 GB) और `face-detection` (200-300 MB)

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | छवि फ़ाइल (मल्टीपार्ट) |
| model | string | No | `"auto"` | उपयोग करने के लिए मॉडल: `auto`, `gfpgan`, `codeformer` |
| strength | number | No | `0.8` | उन्नयन शक्ति (0-1)। उच्च मान अधिक प्रबल उन्नयन उत्पन्न करते हैं |
| onlyCenterFace | boolean | No | `false` | केवल सबसे केंद्रीय/प्रमुख चेहरे को उन्नत करें |
| sensitivity | number | No | `0.5` | चेहरा पहचान संवेदनशीलता (0-1) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/enhance-faces \
  -F "file=@portrait.jpg" \
  -F 'settings={"model":"codeformer","strength":0.7,"onlyCenterFace":false}'
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
data: {"phase":"processing","stage":"Enhancing faces...","percent":60}
```

### Final Result (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/portrait_enhanced.png",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 350000,
    "processedSize": 600000,
    "facesDetected": 2,
    "faces": [
      {"x": 120, "y": 80, "w": 100, "h": 100},
      {"x": 350, "y": 90, "w": 95, "h": 95}
    ],
    "model": "codeformer"
  }
}
```

## Notes {#notes}

- `upscale-enhance` मॉडल बंडल (5-6 GB) और `face-detection` मॉडल बंडल (200-300 MB) दोनों आवश्यक हैं।
- GFPGAN अधिक आक्रामक उन्नयन उत्पन्न करता है; CodeFormer पहचान को बेहतर संरक्षित करता है। `auto` इनपुट के लिए सर्वोत्तम मॉडल का चयन करता है।
- अधिकतम गुणवत्ता के लिए आउटपुट हमेशा PNG फ़ॉर्मेट होता है।
- तेज़ फ़्रंटएंड प्रदर्शन के लिए पूर्ण-विभेदन आउटपुट के साथ एक WebP पूर्वावलोकन उत्पन्न किया जाता है।
- `strength` पैरामीटर उन्नत चेहरे को मूल के साथ मिश्रित करता है। सूक्ष्म सुधारों के लिए कम मान (0.3-0.5), प्रबल पुनर्स्थापना के लिए उच्च मान (0.7-1.0) का उपयोग करें।
- स्वचालित डिकोडिंग के माध्यम से HEIC/HEIF, RAW, TGA, PSD, EXR, और HDR इनपुट फ़ॉर्मेट का समर्थन करता है।
