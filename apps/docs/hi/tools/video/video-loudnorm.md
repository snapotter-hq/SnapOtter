---
description: "वीडियो ऑडियो वॉल्यूम को ब्रॉडकास्ट मानक पर सामान्यीकृत करें।"
i18n_source_hash: 078f1e819c9a
i18n_provenance: human
i18n_output_hash: d1d8be10a3c6
---

# Normalize Audio {#normalize-audio}

वीडियो ऑडियो वॉल्यूम को EBU R128 ब्रॉडकास्ट लाउडनेस मानक पर सामान्यीकृत करें।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-loudnorm`

एक वीडियो फ़ाइल के साथ multipart form data स्वीकार करता है। इस टूल में कोई समायोज्य सेटिंग नहीं है।

## Parameters {#parameters}

इस टूल में कोई पैरामीटर नहीं है। यह ऑडियो ट्रैक पर EBU R128 लाउडनेस सामान्यीकरण लागू करता है।

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-loudnorm \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12500000
}
```

## Notes {#notes}

- FFmpeg के `loudnorm` फ़िल्टर का उपयोग करता है, जो -16 LUFS एकीकृत लाउडनेस को -1.5 dBTP true peak और 11 LU लाउडनेस रेंज (EBU R128 ब्रॉडकास्ट मानक) के साथ लक्षित करता है।
- स्रोत ऑडियो sample rate आउटपुट में सुरक्षित रहती है।
- यदि वीडियो में कोई ऑडियो ट्रैक नहीं है, तो अनुरोध 400 त्रुटि लौटाता है।
