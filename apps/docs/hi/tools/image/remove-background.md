---
description: "वैकल्पिक प्रभावों (ब्लर, शैडो, ग्रेडिएंट, कस्टम बैकग्राउंड) के साथ AI-संचालित बैकग्राउंड हटाना।"
i18n_source_hash: 326a91284529
i18n_provenance: human
i18n_output_hash: 09821276c64d
---

# Remove Background {#remove-background}

वैकल्पिक प्रभावों (ब्लर, शैडो, ग्रेडिएंट, कस्टम बैकग्राउंड) के साथ AI-संचालित बैकग्राउंड हटाना।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/remove-background`

**Processing:** असिंक्रोनस (202 लौटाता है, SSE के माध्यम से स्थिति के लिए `/api/v1/jobs/{jobId}/progress` पोल करें)

**Model bundle:** `background-removal` (4-5 GB)

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | इमेज फ़ाइल (multipart) |
| model | string | No | - | उपयोग करने के लिए AI मॉडल संस्करण |
| backgroundType | string | No | `"transparent"` | इनमें से एक: `transparent`, `color`, `gradient`, `blur`, `image` |
| backgroundColor | string | No | - | ठोस बैकग्राउंड के लिए Hex रंग |
| gradientColor1 | string | No | - | पहला ग्रेडिएंट रंग |
| gradientColor2 | string | No | - | दूसरा ग्रेडिएंट रंग |
| gradientAngle | number | No | - | डिग्री में ग्रेडिएंट कोण |
| blurEnabled | boolean | No | - | बैकग्राउंड ब्लर प्रभाव सक्षम करें |
| blurIntensity | number | No | - | ब्लर तीव्रता (0-100) |
| shadowEnabled | boolean | No | - | विषय पर ड्रॉप शैडो सक्षम करें |
| shadowOpacity | number | No | - | शैडो अपारदर्शिता (0-100) |
| outputFormat | string | No | - | आउटपुट प्रारूप: `png`, `webp`, या `avif` |
| edgeRefine | integer | No | - | एज परिशोधन स्तर (0-3) |
| decontaminate | boolean | No | - | किनारों से रंग रिसाव हटाएँ |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/remove-background \
  -F "file=@photo.jpg" \
  -F 'settings={"backgroundType":"transparent","edgeRefine":2,"outputFormat":"png"}'
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
data: {"phase":"processing","stage":"Removing background...","percent":50}
```

### Final Result (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_mask.png",
    "maskUrl": "/api/v1/download/{jobId}/photo_mask.png",
    "originalUrl": "/api/v1/download/{jobId}/photo_original.png",
    "originalSize": 245000,
    "processedSize": 180000,
    "filename": "photo.jpg",
    "model": "rembg"
  }
}
```

## Effects Endpoint (Phase 2) {#effects-endpoint-phase-2}

`POST /api/v1/tools/image/remove-background/effects`

AI मॉडल को पुनः चलाए बिना बैकग्राउंड प्रभावों को फिर से लागू करता है। Phase 1 से कैश किए गए मास्क और मूल का उपयोग करता है।

### Parameters {#parameters-1}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| settings | JSON | Yes | - | प्रभाव सेटिंग्स के साथ JSON (नीचे देखें) |
| backgroundImage | file | No | - | कस्टम बैकग्राउंड इमेज (जब backgroundType `image` हो) |

#### Settings JSON fields {#settings-json-fields}

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| jobId | string | Yes | Phase 1 से जॉब ID |
| filename | string | Yes | Phase 1 से मूल फ़ाइल नाम |
| backgroundType | string | No | `transparent`, `color`, `gradient`, `blur`, `image` |
| backgroundColor | string | No | ठोस बैकग्राउंड के लिए Hex रंग |
| gradientColor1 | string | No | पहला ग्रेडिएंट रंग |
| gradientColor2 | string | No | दूसरा ग्रेडिएंट रंग |
| gradientAngle | number | No | डिग्री में ग्रेडिएंट कोण |
| blurEnabled | boolean | No | बैकग्राउंड ब्लर सक्षम करें |
| blurIntensity | number | No | ब्लर तीव्रता (0-100) |
| shadowEnabled | boolean | No | ड्रॉप शैडो सक्षम करें |
| shadowOpacity | number | No | शैडो अपारदर्शिता (0-100) |
| outputFormat | string | No | `png`, `webp`, या `avif` |

### Example Request {#example-request-1}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/remove-background/effects \
  -F 'settings={"jobId":"a1b2c3d4-...","filename":"photo.jpg","backgroundType":"color","backgroundColor":"#FF5500","outputFormat":"png"}'
```

### Response (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/photo_nobg.png",
  "processedSize": 195000
}
```

## Notes {#notes}

- `background-removal` मॉडल बंडल का इंस्टॉल होना आवश्यक है (4-5 GB)।
- Phase 1 पारदर्शी मास्क और मूल इमेज को कैश करता है ताकि Phase 2 (प्रभाव) AI मॉडल को पुनः चलाए बिना तुरंत अलग-अलग बैकग्राउंड को फिर से लागू कर सके।
- स्वचालित डिकोडिंग के माध्यम से HEIC/HEIF, RAW, TGA, PSD, EXR और HDR इनपुट प्रारूपों का समर्थन करता है।
- प्रोसेसिंग से पहले EXIF रोटेशन स्वतः सुधारा जाता है।
