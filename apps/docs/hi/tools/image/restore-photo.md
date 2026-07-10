---
description: "पुनर्स्थापना, फेस एन्हांसमेंट और रंग के लिए एक AI पाइपलाइन के साथ पुरानी फ़ोटो पर खरोंच, दरार और क्षति की मरम्मत करें।"
i18n_source_hash: 3de13284216c
i18n_provenance: human
i18n_output_hash: ad345e8fad97
---

# Photo Restoration {#photo-restoration}

एक मल्टी-स्टेप AI पाइपलाइन का उपयोग करके पुरानी फ़ोटो पर खरोंच, दरार और क्षति को ठीक करें। स्क्रैच रिपेयर, फेस एन्हांसमेंट, डिनॉइज़िंग और वैकल्पिक कलराइज़ेशन को संयोजित करता है।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/restore-photo`

**Processing:** असिंक्रोनस (202 लौटाता है, SSE के माध्यम से स्थिति के लिए `/api/v1/jobs/{jobId}/progress` पोल करें)

**Model bundle:** `photo-restoration` (4-5 GB)

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | इमेज फ़ाइल (multipart) |
| scratchRemoval | boolean | No | `true` | खरोंच और सतही क्षति हटाएँ |
| faceEnhancement | boolean | No | `true` | पुनर्स्थापित फ़ोटो में चेहरों को बेहतर बनाएँ |
| fidelity | number | No | `0.7` | फेस एन्हांसमेंट निष्ठा (0-1)। उच्च मान मूल विशेषताओं को अधिक संरक्षित करते हैं |
| denoise | boolean | No | `true` | पुनर्स्थापित परिणाम पर डिनॉइज़िंग लागू करें |
| denoiseStrength | number | No | `25` | डिनॉइज़िंग की तीव्रता (0-100) |
| colorize | boolean | No | `false` | पुनर्स्थापित फ़ोटो को कलराइज़ करें (ग्रेस्केल इमेज के लिए) |
| colorizeStrength | number | No | `85` | कलराइज़ेशन तीव्रता (0-100) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/restore-photo \
  -F "file=@damaged-old-photo.jpg" \
  -F 'settings={"scratchRemoval":true,"faceEnhancement":true,"fidelity":0.6,"colorize":true}'
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
data: {"phase":"processing","stage":"Removing scratches...","percent":30}
```

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
    "downloadUrl": "/api/v1/download/{jobId}/damaged-old-photo_restored.jpg",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 200000,
    "processedSize": 350000,
    "width": 1200,
    "height": 900,
    "steps": ["scratch_removal", "face_enhancement", "denoise", "colorize"],
    "scratchCoverage": 12.5,
    "facesEnhanced": 2,
    "isGrayscale": true,
    "colorized": true
  }
}
```

## Notes {#notes}

- `photo-restoration` मॉडल बंडल का इंस्टॉल होना आवश्यक है (4-5 GB)।
- पाइपलाइन कई AI चरणों को क्रमिक रूप से चलाती है: स्क्रैच रिपेयर, फेस एन्हांसमेंट (GFPGAN), डिनॉइज़िंग, और वैकल्पिक रूप से कलराइज़ेशन।
- परिणाम में `steps` सरणी यह दर्शाती है कि कौन से प्रोसेसिंग चरण वास्तव में निष्पादित किए गए।
- `scratchCoverage` इमेज क्षेत्र का अनुमानित प्रतिशत है जिसमें स्क्रैच क्षति थी।
- `fidelity` नियंत्रित करता है कि मूल स्वरूप को संरक्षित करने की तुलना में चेहरों को कितनी दृढ़ता से बेहतर बनाया जाए। निम्न मान अधिक आक्रामक एन्हांसमेंट उत्पन्न करते हैं; उच्च मान अधिक रूढ़िवादी होते हैं।
- `colorize` विकल्प स्वतः पता लगाता है कि इमेज ग्रेस्केल है या नहीं। परिणाम में `isGrayscale` फ़्लैग इस पहचान की पुष्टि करता है।
- आउटपुट प्रारूप स्वतः इनपुट प्रारूप से मेल खाता है।
- स्वचालित डिकोडिंग के माध्यम से HEIC/HEIF, RAW, TGA, PSD, EXR, HDR और AVIF इनपुट प्रारूपों का समर्थन करता है।
