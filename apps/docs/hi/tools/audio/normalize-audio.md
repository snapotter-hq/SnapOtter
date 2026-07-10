---
description: "लाउडनेस को ब्रॉडकास्ट मानक स्तरों (EBU R128) तक समान करें।"
i18n_source_hash: 794d8cfa5ad8
i18n_provenance: human
i18n_output_hash: f11ed4fce381
---

# Normalize Audio {#normalize-audio}

EBU R128 नॉर्मलाइज़ेशन (-16 LUFS) का उपयोग करके audio लाउडनेस को ब्रॉडकास्ट मानक स्तरों तक समान करें।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/normalize-audio`

एक audio फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

इस टूल में कोई कॉन्फ़िगर करने योग्य पैरामीटर नहीं है। यह EBU R128 लाउडनेस नॉर्मलाइज़ेशन स्वचालित रूप से लागू करता है।

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/normalize-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 4500000
}
```

## Notes {#notes}

- EBU R128 लाउडनेस मानक का उपयोग करता है, -16 LUFS को लक्षित करता है।
- पॉडकास्ट, ऑडियोबुक, और ब्रॉडकास्ट कंटेंट के लिए आदर्श जहाँ सुसंगत लाउडनेस महत्वपूर्ण है।
- स्रोत सैंपल रेट आउटपुट में संरक्षित रहता है।
- आउटपुट आमतौर पर इनपुट container रखता है। AAC इनपुट M4A के रूप में लिखा जाता है, और असमर्थित डिकोड-ओनली इनपुट MP3 पर वापस चले जाते हैं।
