---
description: "गुणक के साथ audio प्लेबैक को तेज़ या धीमा करें।"
i18n_source_hash: e39ba662e594
i18n_provenance: human
i18n_output_hash: 829f10644a1c
---

# Audio Speed {#audio-speed}

एक स्पीड गुणक लगाकर audio प्लेबैक को तेज़ या धीमा करें।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/audio-speed`

एक audio फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| factor | number | No | `1.5` | स्पीड गुणक (0.25 से 4)। 1 से कम मान धीमा करते हैं; 1 से अधिक तेज़ करते हैं। |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-speed \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"factor": 2}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 2250000
}
```

## Notes {#notes}

- `0.25` का factor एक-चौथाई स्पीड पर चलता है (4x लंबा)। `4` का factor चौगुनी स्पीड पर चलता है (4x छोटा)।
- स्पीड बदलते समय pitch संरक्षित रहता है (टाइम-स्ट्रेच)। pitch को स्वतंत्र रूप से समायोजित करने के लिए pitch-shift का उपयोग करें।
- आउटपुट आमतौर पर इनपुट container रखता है। AAC इनपुट M4A के रूप में लिखा जाता है, और असमर्थित डिकोड-ओनली इनपुट MP3 पर वापस चले जाते हैं।
