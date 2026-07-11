---
description: "AI इनपेंटिंग (LaMa) के साथ छवियों से अवांछित वस्तुओं को हटाएँ, मिटाने वाले क्षेत्र के मास्क द्वारा निर्देशित।"
i18n_source_hash: 8e2e42a5e4f9
i18n_provenance: human
i18n_output_hash: b95f28ea1761
---

# Object Eraser {#object-eraser}

AI इनपेंटिंग (LaMa मॉडल) का उपयोग करके छवियों से अवांछित वस्तुओं को हटाएँ। एक छवि और मिटाने वाले क्षेत्र को इंगित करने वाला एक मास्क स्वीकार करता है।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/erase-object`

**Processing:** अतुल्यकालिक (202 लौटाता है, SSE के माध्यम से स्थिति के लिए `/api/v1/jobs/{jobId}/progress` पर पोल करें)

**Model bundle:** `object-eraser-colorize` (1-2 GB)

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | स्रोत छवि फ़ाइल (मल्टीपार्ट) |
| mask | file | Yes | - | मास्क छवि (सफ़ेद = मिटाने का क्षेत्र, काला = रखें)। फ़ील्डनाम `mask` के साथ अपलोड किया जाना चाहिए |
| format | string | No | `"auto"` | आउटपुट फ़ॉर्मेट: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| quality | integer | No | `95` | आउटपुट गुणवत्ता (1-100) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/erase-object \
  -F "file=@photo.jpg" \
  -F "mask=@mask.png" \
  -F "format=png" \
  -F "quality=95"
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
data: {"phase":"processing","stage":"Inpainting...","percent":70}
```

### Final Result (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_erased.png",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 245000,
    "processedSize": 230000
  }
}
```

## Notes {#notes}

- `object-eraser-colorize` मॉडल बंडल का स्थापित होना आवश्यक है (1-2 GB)।
- मास्क का स्रोत छवि के समान आयाम होना चाहिए। सफ़ेद पिक्सेल मिटाने वाले क्षेत्रों को इंगित करते हैं; AI उन्हें प्रशंसनीय सामग्री से भरता है।
- उच्च-गुणवत्ता वाली वस्तु हटाने के लिए LaMa (Large Mask Inpainting) का उपयोग करता है।
- गैर-ब्राउज़र-पूर्वावलोकन योग्य आउटपुट फ़ॉर्मेट के लिए, मुख्य आउटपुट के साथ एक WebP पूर्वावलोकन उत्पन्न किया जाता है।
- स्वचालित डिकोडिंग के माध्यम से HEIC/HEIF, RAW, TGA, PSD, EXR, और HDR इनपुट फ़ॉर्मेट का समर्थन करता है।
