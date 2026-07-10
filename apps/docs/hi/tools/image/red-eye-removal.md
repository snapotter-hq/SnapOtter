---
description: "कैमरा फ़्लैश के कारण होने वाली रेड आई का AI-संचालित पता लगाना और सुधार।"
i18n_source_hash: 647c6ff1ef7c
i18n_provenance: human
i18n_output_hash: aa5d51717ef7
---

# Red Eye Removal {#red-eye-removal}

कैमरा फ़्लैश के कारण होने वाली रेड आई का AI-संचालित पता लगाना और सुधार।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/red-eye-removal`

**Processing:** असिंक्रोनस (202 लौटाता है, SSE के माध्यम से स्थिति के लिए `/api/v1/jobs/{jobId}/progress` पोल करें)

**Model bundle:** `face-detection` (200-300 MB)

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | इमेज फ़ाइल (multipart) |
| sensitivity | number | No | `50` | रेड आई डिटेक्शन संवेदनशीलता (0-100)। उच्च मान अधिक सूक्ष्म रेड-आई का पता लगाते हैं |
| strength | number | No | `70` | सुधार की तीव्रता (0-100)। लाल को कितनी आक्रामकता से निष्प्रभावी करना है |
| format | string | No | - | आउटपुट प्रारूप (वैकल्पिक ओवरराइड) |
| quality | number | No | `90` | आउटपुट गुणवत्ता (1-100) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/red-eye-removal \
  -F "file=@flash-photo.jpg" \
  -F 'settings={"sensitivity":60,"strength":80}'
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
data: {"phase":"processing","stage":"Detecting red eyes...","percent":40}
```

### Final Result (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/flash-photo_redeye_fixed.png",
    "originalSize": 280000,
    "processedSize": 290000,
    "facesDetected": 2,
    "eyesCorrected": 4
  }
}
```

## Notes {#notes}

- `face-detection` मॉडल बंडल का इंस्टॉल होना आवश्यक है (200-300 MB)।
- पहले चेहरों का पता लगाता है, फिर प्रत्येक चेहरे के भीतर आँख के क्षेत्रों का पता लगाता है, और अंत में रेड-आई पिक्सेल की पहचान करके उन्हें सुधारता है।
- `facesDetected` गणना यह दर्शाती है कि कितने चेहरे पाए गए; `eyesCorrected` उन अलग-अलग आँखों की कुल संख्या है जिनकी रेड-आई सुधारी गई।
- अधिकतम गुणवत्ता संरक्षण के लिए आउटपुट हमेशा PNG होता है।
- स्वचालित डिकोडिंग के माध्यम से HEIC/HEIF, RAW, TGA, PSD, EXR और HDR इनपुट प्रारूपों का समर्थन करता है।
