---
description: "किसी भी audio फ़ाइल से एक रिंगटोन क्लिप बनाएँ।"
i18n_source_hash: 8fcdcc545fbc
i18n_provenance: human
i18n_output_hash: 193a17b685bf
---

# Ringtone Maker {#ringtone-maker}

एक आरंभ समय और अवधि चुनकर किसी भी audio फ़ाइल से एक रिंगटोन क्लिप (.m4r) बनाएँ।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/ringtone-maker`

एक audio फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| startS | number | No | `0` | सेकंड में आरंभ समय (न्यूनतम 0) |
| durationS | number | No | `30` | सेकंड में क्लिप अवधि (1 से 30) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/ringtone-maker \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"startS": 15, "durationS": 20}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.m4r",
  "originalSize": 4500000,
  "processedSize": 620000
}
```

## Notes {#notes}

- आउटपुट हमेशा M4R फ़ॉर्मैट होता है, जो iPhone रिंगटोन के साथ संगत है।
- अधिकतम रिंगटोन अवधि 30 सेकंड है (Apple सीमा)।
- किसी भी audio फ़ॉर्मैट को इनपुट के रूप में उपयोग किया जा सकता है।
