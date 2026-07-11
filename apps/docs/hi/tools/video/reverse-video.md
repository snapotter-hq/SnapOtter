---
description: "किसी वीडियो क्लिप को उल्टा चलाएँ।"
i18n_source_hash: 98226f4e092d
i18n_provenance: human
i18n_output_hash: 14ef601cdcac
---

# Reverse Video {#reverse-video}

किसी वीडियो क्लिप को उल्टा चलाएँ। ऑडियो ट्रैक भी उल्टा हो जाता है।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/reverse-video`

एक वीडियो फ़ाइल के साथ multipart form data स्वीकार करता है। इस टूल में कोई समायोज्य सेटिंग नहीं है।

## Parameters {#parameters}

इस टूल में कोई पैरामीटर नहीं है। यह पूरे वीडियो को उल्टा कर देता है।

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/reverse-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12600000
}
```

## Notes {#notes}

- लंबाई में 5 मिनट तक की क्लिप तक सीमित है। लंबे वीडियो 400 त्रुटि के साथ अस्वीकार किए जाते हैं।
- वीडियो और ऑडियो दोनों ट्रैक उल्टे हो जाते हैं। ऑडियो के बिना वीडियो उल्टा करने के लिए, पहले उसे म्यूट करें।
