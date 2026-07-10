---
description: "AI आउटपेंटिंग से किसी छवि के कैनवास का विस्तार करें, इसे किसी भी दिशा में बढ़ाएँ और नए क्षेत्रों को मूल से मेल खाने के लिए भरें।"
i18n_source_hash: 1b00db4ed40d
i18n_provenance: human
i18n_output_hash: 4313b48bf882
---

# AI Canvas Expand {#ai-canvas-expand}

AI-संचालित फिल (आउटपेंटिंग) से किसी छवि के कैनवास का विस्तार करें। छवि को किसी भी दिशा में बढ़ाता है और नए क्षेत्रों को मौजूदा छवि से मेल खाने वाली AI-जनित सामग्री से भरता है।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/ai-canvas-expand`

**Processing:** असिंक्रोनस (202 लौटाता है, स्थिति के लिए SSE के ज़रिए `/api/v1/jobs/{jobId}/progress` पोल करें)

**Model bundle:** `object-eraser-colorize` (1-2 GB)

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | छवि फ़ाइल (multipart) |
| extendTop | integer | No | `0` | शीर्ष पर विस्तार करने के लिए पिक्सेल |
| extendRight | integer | No | `0` | दाईं ओर विस्तार करने के लिए पिक्सेल |
| extendBottom | integer | No | `0` | नीचे विस्तार करने के लिए पिक्सेल |
| extendLeft | integer | No | `0` | बाईं ओर विस्तार करने के लिए पिक्सेल |
| tier | string | No | `"balanced"` | गुणवत्ता श्रेणी: `fast`, `balanced`, `high` |
| format | string | No | `"auto"` | आउटपुट प्रारूप: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| quality | integer | No | `95` | आउटपुट गुणवत्ता (1-100) |

कम से कम एक विस्तार दिशा 0 से अधिक होनी चाहिए।

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/ai-canvas-expand \
  -F "file=@photo.jpg" \
  -F 'settings={"extendTop":200,"extendBottom":200,"extendLeft":100,"extendRight":100,"tier":"balanced"}'
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
data: {"phase":"processing","stage":"Expanding canvas...","percent":50}
```

### Final Result (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_extended.png",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 300000,
    "processedSize": 520000
  }
}
```

## Notes {#notes}

- इसके लिए `object-eraser-colorize` मॉडल बंडल का इंस्टॉल होना आवश्यक है (1-2 GB)।
- विस्तारित क्षेत्रों के लिए सामग्री उत्पन्न करने हेतु LaMa-आधारित आउटपेंटिंग का उपयोग करता है।
- `tier` पैरामीटर गति और गुणवत्ता के बीच समझौता करता है: `fast` संभावित आर्टिफ़ैक्ट के साथ त्वरित परिणाम देता है, `high` अधिक समय लेता है लेकिन अधिक चिकने, अधिक सुसंगत फिल देता है।
- विस्तार मान पिक्सेल में होते हैं। अंतिम छवि आयाम होंगे: मूल चौड़ाई + extendLeft + extendRight गुणा मूल ऊँचाई + extendTop + extendBottom।
- गैर-ब्राउज़र-पूर्वावलोकन योग्य आउटपुट प्रारूपों (HEIC, JXL, TIFF) के लिए, मुख्य आउटपुट के साथ एक WebP पूर्वावलोकन उत्पन्न किया जाता है।
- स्वचालित डिकोडिंग के ज़रिए HEIC/HEIF, RAW, TGA, PSD, EXR, और HDR इनपुट प्रारूपों का समर्थन करता है।
