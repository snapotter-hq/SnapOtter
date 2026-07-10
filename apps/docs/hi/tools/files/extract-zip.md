---
description: "bomb सुरक्षा के साथ ZIP संग्रह से फ़ाइलों को सुरक्षित रूप से निकालें।"
i18n_source_hash: 484a1f1051b8
i18n_provenance: human
i18n_output_hash: 29e5eec46868
---

# Extract ZIP {#extract-zip}

ZIP संग्रह से फ़ाइलों को सुरक्षित रूप से निकालें। सिंगल-फ़ाइल संग्रह निहित फ़ाइल को सीधे लौटाते हैं; multi-file संग्रह निकाली गई सामग्री के साथ एक flat ZIP लौटाते हैं।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/extract-zip`

एक ZIP फ़ाइल के साथ multipart form data स्वीकार करता है। किसी settings फ़ील्ड की आवश्यकता नहीं है।

## Parameters {#parameters}

इस टूल में कोई कॉन्फ़िगर करने योग्य पैरामीटर नहीं है। निकालने के लिए एक `.zip` फ़ाइल अपलोड करें।

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/extract-zip \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@archive.zip"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/archive_extracted.zip",
  "originalSize": 2800000,
  "processedSize": 3500000
}
```

## Notes {#notes}

- केवल `.zip` फ़ाइलें इनपुट के रूप में स्वीकार की जाती हैं।
- यदि संग्रह में एक ही फ़ाइल है, तो वह फ़ाइल सीधे लौटाई जाती है (ZIP में लपेटी नहीं जाती)।
- यदि संग्रह में कई फ़ाइलें हैं, तो सभी फ़ाइलों के साथ रूट स्तर पर निकाली गई एक flat ZIP लौटाई जाती है (नेस्टेड डायरेक्टरी संरचना समतल कर दी जाती है)।
- अंतर्निहित bomb सुरक्षा संसाधन समाप्ति को रोकने के लिए अत्यधिक संपीड़न अनुपात या फ़ाइल संख्या वाले संग्रहों को अस्वीकार कर देती है।
