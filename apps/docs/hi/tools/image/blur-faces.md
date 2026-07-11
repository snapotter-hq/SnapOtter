---
description: "गोपनीयता और GDPR-अनुरूप गुमनामीकरण के लिए AI चेहरा पहचान से छवियों में चेहरों को स्वतः पहचानें और धुंधला करें।"
i18n_source_hash: fb861c12aea5
i18n_provenance: human
i18n_output_hash: 34ba52083c4a
---

# Face / PII Blur {#face-pii-blur}

AI-संचालित चेहरा पहचान (MediaPipe) का उपयोग करके छवियों में चेहरों को स्वतः पहचानें और धुंधला करें।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/blur-faces`

**Processing:** असिंक्रोनस (202 लौटाता है, स्थिति के लिए SSE के ज़रिए `/api/v1/jobs/{jobId}/progress` पोल करें)

**Model bundle:** `face-detection` (200-300 MB)

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | छवि फ़ाइल (multipart) |
| blurRadius | number | No | `30` | पहचाने गए चेहरों पर लागू ब्लर त्रिज्या (1-100) |
| sensitivity | number | No | `0.5` | चेहरा पहचान संवेदनशीलता (0-1)। कम मान अधिक आत्मविश्वास के साथ कम चेहरे पहचानते हैं |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/blur-faces \
  -F "file=@group-photo.jpg" \
  -F 'settings={"blurRadius":40,"sensitivity":0.3}'
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
data: {"phase":"processing","stage":"Detecting faces...","percent":40}
```

### Final Result (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/group-photo_blurred.jpg",
    "originalSize": 450000,
    "processedSize": 420000,
    "facesDetected": 3,
    "faces": [
      {"x": 100, "y": 50, "w": 80, "h": 80},
      {"x": 300, "y": 60, "w": 75, "h": 75},
      {"x": 500, "y": 55, "w": 85, "h": 85}
    ]
  }
}
```

### No Faces Detected {#no-faces-detected}

यदि कोई चेहरा नहीं मिलता है, तो परिणाम में एक चेतावनी शामिल होती है:

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "facesDetected": 0,
    "warning": "No faces detected in this image. Try increasing detection sensitivity."
  }
}
```

## Notes {#notes}

- इसके लिए `face-detection` मॉडल बंडल का इंस्टॉल होना आवश्यक है (200-300 MB)।
- आउटपुट प्रारूप स्वचालित रूप से इनपुट प्रारूप से मेल खाता है।
- `faces` सरणी में प्रत्येक पहचाने गए चेहरे के लिए बाउंडिंग बॉक्स निर्देशांक (x, y, width, height) होते हैं।
- आंशिक रूप से ढके चेहरों सहित अधिक चेहरे पहचानने के लिए `sensitivity` बढ़ाएँ (1.0 के करीब)।
- स्वचालित डिकोडिंग के ज़रिए HEIC/HEIF, RAW, TGA, PSD, EXR, और HDR इनपुट प्रारूपों का समर्थन करता है।
