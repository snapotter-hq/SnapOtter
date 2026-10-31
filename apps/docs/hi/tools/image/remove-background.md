---
description: "वैकल्पिक प्रभावों (ब्लर, शैडो, ग्रेडिएंट, कस्टम बैकग्राउंड) के साथ AI-संचालित बैकग्राउंड हटाना।"
i18n_source_hash: 0814cd471fc1
i18n_provenance: human
i18n_output_hash: 849b466fc2b3
---

# Remove Background {#remove-background}

वैकल्पिक प्रभावों (ब्लर, शैडो, ग्रेडिएंट, कस्टम बैकग्राउंड) के साथ AI-संचालित बैकग्राउंड हटाना।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/remove-background`

**Processing:** असिंक्रोनस (202 लौटाता है, SSE के माध्यम से स्थिति के लिए `/api/v1/jobs/{jobId}/progress` पोल करें)

**Model bundle:** `background-removal` (4-5 GB)

## Parameters {#parameters}

Phase 1 बैकग्राउंड हटाता है और पारदर्शी PNG मास्क तथा मूल इमेज को कैश करता है। बैकग्राउंड प्रतिस्थापन, ब्लर, ड्रॉप शैडो और आउटपुट प्रारूप रूपांतरण [Phase 2 (`/api/v1/tools/image/remove-background/effects`)](#effects-endpoint-phase-2) में लागू किए जाते हैं (या जब `remove-background` को पाइपलाइन चरण या बैच जॉब के रूप में चलाया जाता है); उन फ़ील्ड को Phase 1 को भेजने पर 400 लौटता है।

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | इमेज फ़ाइल (multipart) |
| model | string | No | - | उपयोग करने के लिए AI मॉडल संस्करण |
| edgeRefine | integer | No | - | एज परिशोधन स्तर (0-3) |
| decontaminate | boolean | No | - | किनारों से रंग रिसाव हटाएँ |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/remove-background \
  -F "file=@photo.jpg" \
  -F 'settings={"model":"birefnet-portrait","edgeRefine":2,"decontaminate":true}'
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
| backgroundImage | file | Required when `backgroundType` is `image` | - | कस्टम बैकग्राउंड इमेज |

#### Settings JSON fields {#settings-json-fields}

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| jobId | string | Yes | - | Phase 1 से जॉब ID |
| filename | string | Yes | - | Phase 1 से मूल फ़ाइल नाम |
| backgroundType | string | No | `"transparent"` | इनमें से एक: `transparent`, `color`, `gradient`, `blur`, `image` |
| backgroundColor | string | Required when `backgroundType` is `color` | - | Hex रंग: `#RRGGBB` या `#RGB` (`#` वैकल्पिक है) |
| gradientColor1 | string | Required when `backgroundType` is `gradient` | - | पहला ग्रेडिएंट रंग, `backgroundColor` जैसा hex |
| gradientColor2 | string | Required when `backgroundType` is `gradient` | - | दूसरा ग्रेडिएंट रंग, `backgroundColor` जैसा hex |
| gradientAngle | number | No | - | डिग्री में ग्रेडिएंट कोण |
| blurEnabled | boolean | No | - | विषय के पीछे मूल बैकग्राउंड को ब्लर करें (`backgroundType: "blur"` इसे स्वतः लागू करता है) |
| blurIntensity | number | No | - | ब्लर तीव्रता (0-100) |
| shadowEnabled | boolean | No | - | विषय पर ड्रॉप शैडो सक्षम करें |
| shadowOpacity | number | No | `35` | शैडो अपारदर्शिता (0-100), जब `shadowEnabled` true हो तब उपयोग होती है |
| outputFormat | string | No | `"png"` | आउटपुट प्रारूप: `png`, `webp`, या `avif` |

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

#### त्रुटि: बैकग्राउंड हटाना समाप्त (410) {#error-background-removal-expired-410}

effects endpoint उस मास्क और मूल से काम करता है जिसे Phase 1 ने `jobId` के लिए संग्रहीत किया था। संग्रहीत आउटपुट कुछ समय बाद साफ़ कर दिए जाते हैं, इसलिए यदि दोनों कॉलों के बीच बहुत अधिक समय बीत जाए, तो वे चले जाते हैं। उसी इमेज के साथ Phase 1 फिर से चलाएँ और उसके द्वारा लौटाए गए `jobId` का उपयोग करें।

```json
{
  "error": "This image's background removal has expired. Remove the background again.",
  "code": "BACKGROUND_REMOVAL_EXPIRED"
}
```

ऐसा `jobId` या `filename` जो किसी संग्रहीत फ़ाइल को नाम नहीं दे सकता (पथ विभाजक, `..`, खाली स्ट्रिंग) 400 लौटाता है।

## Notes {#notes}

- `background-removal` मॉडल बंडल का इंस्टॉल होना आवश्यक है (4-5 GB)।
- Phase 1 पारदर्शी मास्क और मूल इमेज को कैश करता है ताकि Phase 2 (प्रभाव) AI मॉडल को पुनः चलाए बिना तुरंत अलग-अलग बैकग्राउंड को फिर से लागू कर सके।
- स्वचालित डिकोडिंग के माध्यम से HEIC/HEIF, RAW, TGA, PSD, EXR और HDR इनपुट प्रारूपों का समर्थन करता है।
- प्रोसेसिंग से पहले EXIF रोटेशन स्वतः सुधारा जाता है।
