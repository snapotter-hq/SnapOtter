---
description: "आरंभ और समाप्ति समय निर्दिष्ट करके किसी वीडियो में से एक क्लिप काटें।"
i18n_source_hash: 0385b4e963d0
i18n_provenance: machine
i18n_output_hash: 3d0e1a9a211b
i18n_hash_version: 2
---

# Trim Video {#trim-video}

किसी वीडियो में से एक क्लिप काटें। आरंभ और समाप्ति समय के बीच का हिस्सा रखें, या शुरुआत और अंत से एक निश्चित अवधि हटाएँ। फ्रेम-सटीक कट के लिए एक विकल्प भी उपलब्ध है।

ऐप में समय वाले फ़ील्ड सादे सेकंड (`90`), `MM:SS` (`1:30`) या `HH:MM:SS` (`1:02:03.5`) स्वीकार करते हैं। API सेकंड स्वीकार करता है।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/trim-video`

एक वीडियो फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `range` | `range` `startS` से `endS` तक का हिस्सा रखता है। `ends` शुरुआत से `cutStartS` और अंत से `cutEndS` हटाता है |
| startS | number | No | `0` | Range mode: सेकंड में आरंभ समय (>= 0 होना चाहिए) |
| endS | number | Range mode | - | Range mode: सेकंड में समाप्ति समय (startS के बाद होना चाहिए) |
| cutStartS | number | No | `0` | Ends mode: शुरुआत से हटाए जाने वाले सेकंड |
| cutEndS | number | No | `0` | Ends mode: अंत से हटाए जाने वाले सेकंड |
| precise | boolean | No | `false` | अगले keyframe से कॉपी करने के बजाय पूरी रेंज को फिर से एन्कोड करें, ताकि आरंभ और समाप्ति दोनों फ्रेम सटीक हों |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/trim-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"startS": 5, "endS": 30, "precise": true}'
```

वीडियो की लंबाई चाहे जो हो, पहले 5 सेकंड और आखिरी 10 सेकंड काटें:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/trim-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"mode": "ends", "cutStartS": 5, "cutEndS": 10}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 4200000
}
```

## Notes {#notes}

- जब `precise` का मान `false` (डिफ़ॉल्ट) हो, तो क्लिप ठीक उसी फ्रेम से शुरू होती है जो आपने माँगा था। केवल उस आरंभ और अगले keyframe के बीच के फ्रेम फिर से एन्कोड किए जाते हैं और बाकी कॉपी किए जाते हैं, इसलिए यह तेज़ रहता है। अंत एक फ्रेम या उससे थोड़ा लंबा हो सकता है, क्योंकि कॉपी की गई स्ट्रीम उन फ्रेम को रखती है जिन पर पिछले फ्रेम निर्भर करते हैं। जिन स्रोतों को इस तरह सुरक्षित रूप से जोड़ा नहीं जा सकता (10-bit या interlaced H.264, ऐसे अन्य codec जिन्हें फिर से एन्कोड की गई शुरुआत चाहिए, या AVI, FLV, MPEG और TS फ़ाइलें) उन्हें इसके बजाय पूरी तरह फिर से एन्कोड किया जाता है।
- `precise` को `true` सेट करने पर हमेशा पूरी रेंज फिर से एन्कोड होती है, इसलिए दोनों सिरे सटीक होते हैं, लेकिन इसमें अधिक समय लगता है।
- range mode में `endS` का मान `startS` से अधिक होना चाहिए। यदि `endS` वीडियो के अंत से आगे हो, तो क्लिप अंत तक चलती है।
- ends mode में `cutStartS` और `cutEndS` में से कम से कम एक शून्य से अधिक होना चाहिए, और दोनों मिलकर वीडियो का कुछ हिस्सा बचाए रखें। चूँकि कट हर फ़ाइल की अपनी लंबाई से मापा जाता है, इसलिए एक ही सेटिंग अलग-अलग अवधि वाले वीडियो के बैच पर काम करती है।
