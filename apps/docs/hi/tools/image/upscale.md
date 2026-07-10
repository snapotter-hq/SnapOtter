---
description: "बारीक विवरण को संरक्षित करते हुए Real-ESRGAN AI सुपर-रिज़ॉल्यूशन के साथ छवियों को 2x से 4x तक अपस्केल करें।"
i18n_source_hash: 150032e99476
i18n_provenance: human
i18n_output_hash: cab014c91ae8
---

# Image Upscaling {#image-upscaling}

Real-ESRGAN का उपयोग करके AI सुपर-रिज़ॉल्यूशन संवर्धन। विवरण को संरक्षित करते हुए छवियों को 2x-4x तक अपस्केल करता है।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/upscale`

**Processing:** असिंक्रोनस (202 लौटाता है, SSE के माध्यम से स्थिति के लिए `/api/v1/jobs/{jobId}/progress` को पोल करें)

**Model bundle:** `upscale-enhance` (5-6 GB)

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | Image फ़ाइल (multipart) |
| scale | number | No | `2` | अपस्केल फ़ैक्टर (उदा., 2, 3, 4) |
| model | string | No | `"auto"` | उपयोग करने के लिए मॉडल (उदा., `auto`, विशिष्ट मॉडल नाम) |
| faceEnhance | boolean | No | `false` | अपस्केलिंग के दौरान फ़ेस एन्हांसमेंट लागू करें |
| denoise | number | No | `0` | डीनॉइज़िंग स्ट्रेंथ (0 = बंद) |
| format | string | No | `"auto"` | आउटपुट फ़ॉर्मेट: `auto`, `png`, `jpg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| quality | number | No | `95` | आउटपुट गुणवत्ता (1-100) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/upscale \
  -F "file=@photo.jpg" \
  -F 'settings={"scale":4,"model":"auto","faceEnhance":true,"format":"png"}'
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
data: {"phase":"processing","stage":"Upscaling...","percent":60}
```

### Final Result (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_4x.png",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 120000,
    "processedSize": 2400000,
    "width": 4096,
    "height": 4096,
    "method": "realesrgan-x4plus"
  }
}
```

## Notes {#notes}

- `upscale-enhance` मॉडल बंडल (5-6 GB) इंस्टॉल होना आवश्यक है।
- उपलब्ध होने पर Real-ESRGAN का उपयोग करता है; यदि AI मॉडल अनुपलब्ध है तो Lanczos इंटरपोलेशन पर वापस चला जाता है।
- बेहतर फ़ेस गुणवत्ता के लिए `faceEnhance` विकल्प अपस्केलिंग के दौरान GFPGAN फ़ेस रीस्टोरेशन लागू करता है।
- गैर-ब्राउज़र-पूर्वावलोकन योग्य आउटपुट फ़ॉर्मेट (HEIC, JXL, TIFF) के लिए, मुख्य आउटपुट के साथ एक WebP पूर्वावलोकन उत्पन्न किया जाता है।
- स्वचालित डिकोडिंग के माध्यम से HEIC/HEIF, RAW, TGA, PSD, EXR, और HDR इनपुट फ़ॉर्मेट का समर्थन करता है।
