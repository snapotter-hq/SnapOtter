---
description: "मल्टी-टियर गुणवत्ता विकल्पों के साथ AI-संचालित शोर और ग्रेन हटाना।"
i18n_source_hash: f0dfc876e0e0
i18n_provenance: human
i18n_output_hash: f92fccc3c770
---

# Noise Removal {#noise-removal}

Python sidecar (SCUNet मॉडल) का उपयोग करते हुए, मल्टी-टियर गुणवत्ता विकल्पों के साथ AI-संचालित शोर और ग्रेन हटाना।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/noise-removal`

**Processing:** असिंक्रोनस (202 लौटाता है, SSE के माध्यम से स्थिति के लिए `/api/v1/jobs/{jobId}/progress` पोल करें)

**Model bundle:** `upscale-enhance` (5-6 GB)

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | इमेज फ़ाइल (multipart) |
| tier | string | No | `"balanced"` | गुणवत्ता टियर: `quick`, `balanced`, `quality`, `maximum` |
| strength | number | No | `50` | डिनॉइज़िंग की तीव्रता (0-100) |
| detailPreservation | number | No | `50` | कितना विवरण संरक्षित करना है (0-100)। उच्च मान अधिक टेक्स्चर बनाए रखते हैं |
| colorNoise | number | No | `30` | रंग शोर घटाने की तीव्रता (0-100) |
| format | string | No | `"original"` | आउटपुट प्रारूप: `original`, `png`, `jpeg`, `webp`, `avif`, `jxl` |
| quality | number | No | `90` | आउटपुट एन्कोडिंग गुणवत्ता (1-100) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/noise-removal \
  -F "file=@noisy-photo.jpg" \
  -F 'settings={"tier":"quality","strength":60,"detailPreservation":70,"colorNoise":40}'
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
data: {"phase":"processing","stage":"Denoising...","percent":65}
```

### Final Result (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/noisy-photo_denoised.jpg",
    "originalSize": 500000,
    "processedSize": 380000
  }
}
```

## Notes {#notes}

- `upscale-enhance` मॉडल बंडल का इंस्टॉल होना आवश्यक है (5-6 GB)।
- गुणवत्ता टियर गति और गुणवत्ता के बीच अदला-बदली करते हैं: `quick` बुनियादी डिनॉइज़िंग के साथ सबसे तेज़ है, `maximum` सबसे गहन मल्टी-पास दृष्टिकोण का उपयोग करता है।
- टेक्स्चर वाले विषयों (कपड़ा, बाल, पत्ते) के लिए `detailPreservation` पैरामीटर महत्वपूर्ण है। उच्च मान डिनॉइज़र को महीन विवरण को चिकना करके हटाने से रोकते हैं।
- जब `format` को `"original"` पर सेट किया जाता है, तो आउटपुट प्रारूप इनपुट फ़ाइल प्रारूप से मेल खाता है।
- स्वचालित डिकोडिंग के माध्यम से HEIC/HEIF, RAW, TGA, PSD, EXR और HDR इनपुट प्रारूपों का समर्थन करता है।
