---
description: "समय अंतराल, समान भागों, या मौन पहचान के आधार पर ऑडियो को विभाजित करें।"
i18n_source_hash: c062a395dbac
i18n_provenance: human
i18n_output_hash: d4a67b0a3b28
---

# Split Audio {#split-audio}

एक ऑडियो फ़ाइल को निश्चित समय अंतराल, समान भागों, या स्वचालित मौन पहचान के आधार पर खंडों में विभाजित करें। खंडों का एक ZIP संग्रह लौटाता है।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/split-audio`

एक ऑडियो फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `"time"` | विभाजन रणनीति: `time`, `parts`, `silence` |
| segmentS | number | No | `60` | सेकंड में खंड की लंबाई, 1 से 3600 (जब mode `time` हो तब उपयोग किया जाता है) |
| parts | integer | No | `2` | समान भागों की संख्या, 2 से 20 (जब mode `parts` हो तब उपयोग किया जाता है) |
| thresholdDb | number | No | `-40` | dB में मौन थ्रेशोल्ड, -80 से -20 (जब mode `silence` हो तब उपयोग किया जाता है) |
| minSilenceS | number | No | `0.3` | सेकंड में न्यूनतम मौन अंतराल, 0.1 से 10 (जब mode `silence` हो तब उपयोग किया जाता है) |

## Example Request {#example-request}

30-सेकंड के खंडों में विभाजित करें:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/split-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "time", "segmentS": 30}'
```

मौन पहचान द्वारा विभाजित करें:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/split-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "silence", "thresholdDb": -35, "minSilenceS": 0.5}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio_parts.zip",
  "originalSize": 4500000,
  "processedSize": 4600000
}
```

## Notes {#notes}

- `downloadUrl` सभी खंडों वाले एक ZIP संग्रह की ओर इशारा करता है।
- चुनी गई `mode` से संबंधित केवल पैरामीटर ही उपयोग किए जाते हैं; अन्य को अनदेखा कर दिया जाता है।
- खंड फ़ाइल नाम क्रमिक रूप से क्रमांकित होते हैं (जैसे `part-000.mp3`, `part-001.mp3`)।
- आउटपुट फ़ॉर्मेट इनपुट फ़ॉर्मेट से मेल खाता है।
