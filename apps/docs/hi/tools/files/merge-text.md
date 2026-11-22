---
description: "अपनी चुनी हुई क्रम में कई टेक्स्ट या Markdown फ़ाइलों को एक में जोड़ें।"
i18n_source_hash: 9b3ddd1eba68
i18n_provenance: machine
i18n_output_hash: 6e7ad5c12a89
i18n_hash_version: 2
---

# टेक्स्ट फ़ाइलें मर्ज {#merge-text}

कई टेक्स्ट या Markdown फ़ाइलों को एक ही फ़ाइल में जोड़ें। फ़ाइलें अपलोड के क्रम में जुड़ती हैं, इसलिए यदि क्रम मायने रखता है तो चलाने से पहले फ़ाइल सूची में उन्हें फिर से व्यवस्थित करें।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/merge-text`

दो या अधिक टेक्स्ट फ़ाइलों और वैकल्पिक `settings` JSON स्ट्रिंग वाला multipart फ़ॉर्म डेटा स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `separator` | string | `"blank-line"` | फ़ाइलों के बीच क्या रखा जाए: `"blank-line"`, `"rule"` (`---` पंक्ति) या `"filename-heading"` (हर फ़ाइल का नाम शीर्षक के रूप में) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/merge-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@chapter-1.md" \
  -F "file=@chapter-2.md" \
  -F 'settings={"separator":"filename-heading"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.md",
  "originalSize": 8200,
  "processedSize": 8240
}
```

## Notes {#notes}

- `.txt`, `.md`, `.markdown`, `.csv` और `.log` फ़ाइलें स्वीकार करता है, प्रति अनुरोध 2 से 50 के बीच।
- हर फ़ाइल UTF-8 टेक्स्ट होनी चाहिए। बाइनरी या गैर-UTF-8 फ़ाइल अस्वीकार कर दी जाती है और त्रुटि में उसका नाम दिखता है।
- जब सभी इनपुट का एक्सटेंशन समान हो, तो आउटपुट उसे बनाए रखता है (`merged.md`, `merged.log`)। मिश्रित इनपुट से `merged.txt` बनता है।
- `filename-heading` के साथ, Markdown आउटपुट `# name.md` शीर्षकों का उपयोग करता है; सादा टेक्स्ट आउटपुट `==> name.txt <==` मार्कर पंक्तियों का उपयोग करता है।
- हर फ़ाइल के अंत की खाली पंक्तियाँ हटा दी जाती हैं ताकि विभाजक दस्तावेज़ों के बीच साफ़ बैठे। शुरुआती बाइट-ऑर्डर मार्क हटा दिया जाता है।
- CSV फ़ाइलें सादे टेक्स्ट के रूप में जोड़ी जाती हैं। एक ही हेडर पंक्ति के साथ तालिकाओं को मिलाने के लिए [Merge CSVs](./merge-csvs) का उपयोग करें।
- `.eml` ईमेल फ़ाइलें अभी समर्थित नहीं हैं।
