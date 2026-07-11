---
description: "नकली पारदर्शी PNG को AI मैटिंग (BiRefNet) से ठीक करें ताकि वास्तविक अल्फ़ा उत्पन्न हो, साथ ही डिफ्रिंज एज सफ़ाई।"
i18n_source_hash: 7eb748b80f93
i18n_provenance: human
i18n_output_hash: 20c39a491e3d
---

# PNG Transparency Fixer {#png-transparency-fixer}

एक क्लिक में नकली पारदर्शी PNG को ठीक करें। वास्तविक अल्फ़ा पारदर्शिता उत्पन्न करने के लिए AI मैटिंग (BiRefNet HR Matting मॉडल) का उपयोग करता है, किनारों को साफ़ करने के लिए डिफ्रिंज पोस्ट-प्रोसेसिंग के साथ।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/transparency-fixer`

**Processing:** असिंक्रोनस (202 लौटाता है, SSE के माध्यम से स्थिति के लिए `/api/v1/jobs/{jobId}/progress` को पोल करें)

**Model bundle:** `background-removal` (4-5 GB)

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | Image फ़ाइल (multipart) |
| defringe | number | No | `30` | डिफ्रिंज तीव्रता (0-100)। किनारों के चारों ओर अर्ध-पारदर्शी फ्रिंज पिक्सेल हटाता है |
| outputFormat | string | No | `"png"` | आउटपुट फ़ॉर्मेट: `png` या `webp` |
| removeWatermark | boolean | No | `false` | वॉटरमार्क हटाने की प्री-प्रोसेसिंग लागू करें (median filter) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/transparency-fixer \
  -F "file=@fake-transparent.png" \
  -F 'settings={"defringe":40,"outputFormat":"png"}'
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
data: {"phase":"processing","stage":"Processing transparency...","percent":50}
```

### Final Result (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/fake-transparent_fixed.png",
    "originalSize": 180000,
    "processedSize": 150000,
    "filename": "fake-transparent.png"
  }
}
```

## Notes {#notes}

- `background-removal` मॉडल बंडल (4-5 GB) इंस्टॉल होना आवश्यक है।
- उच्च-गुणवत्ता वाली अल्फ़ा मैटिंग के लिए प्राथमिक मॉडल के रूप में `birefnet-hr-matting` का उपयोग करता है। यदि HR मॉडल की मेमोरी समाप्त हो जाती है तो `birefnet-general` पर वापस चला जाता है।
- `defringe` विकल्प अर्ध-पारदर्शी फ्रिंज पिक्सेल हटाता है जिन्हें AI मैटिंग कभी-कभी बालों, फ़र, और बारीक किनारों के चारों ओर छोड़ देती है। यह अल्फ़ा चैनल को ब्लर करके और कम-कॉन्फ़िडेंस पिक्सेल को शून्य करके काम करता है।
- `removeWatermark` विकल्प एक median filter प्री-प्रोसेसिंग चरण लागू करता है। यह एक बुनियादी वॉटरमार्क कमी है, न कि एक समर्पित वॉटरमार्क हटाने वाला टूल।
- केवल PNG या lossless WebP आउटपुट करता है (दोनों अल्फ़ा पारदर्शिता का समर्थन करते हैं)।
- स्वचालित डिकोडिंग के माध्यम से HEIC/HEIF, RAW, TGA, PSD, EXR, और HDR इनपुट फ़ॉर्मेट का समर्थन करता है।
