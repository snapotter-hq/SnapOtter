---
description: "CSV या JSON डेटा से बार, लाइन, या पाई चार्ट बनाएं।"
i18n_source_hash: d3c39384457b
i18n_provenance: human
i18n_output_hash: 084c7a3fd621
---

# Chart Maker {#chart-maker}

CSV या JSON डेटा से बार, लाइन, या पाई चार्ट बनाएं। रेंडर किए गए चार्ट की एक PNG इमेज लौटाता है।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/chart-maker`

एक CSV या JSON फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| kind | string | No | `"bar"` | चार्ट प्रकार: `bar`, `line`, `pie` |
| title | string | No | - | चार्ट शीर्षक (अधिकतम 120 वर्ण) |
| width | integer | No | `960` | पिक्सेल में चार्ट की चौड़ाई (320-2048) |
| height | integer | No | `540` | पिक्सेल में चार्ट की ऊंचाई (240-1536) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/chart-maker \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@sales.csv" \
  -F 'settings={"kind": "line", "title": "Monthly Sales", "width": 960, "height": 540}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/sales_chart.png",
  "originalSize": 1024,
  "processedSize": 48500
}
```

## Notes {#notes}

- इनपुट एक `.csv` या `.json` फ़ाइल होनी चाहिए। CSV फ़ाइलों में कॉलम नामों के साथ एक हेडर पंक्ति होनी चाहिए।
- पहला कॉलम श्रेणी लेबल के रूप में उपयोग किया जाता है; दूसरा कॉलम संख्यात्मक होना चाहिए और डेटा मान प्रदान करता है। केवल दो कॉलम उपयोग किए जाते हैं।
- JSON इनपुट `{label, value}` ऑब्जेक्ट्स का एक ऐरे होना चाहिए, या एक सादा ऑब्जेक्ट जिसकी कुंजियाँ लेबल बन जाती हैं और मान डेटा पॉइंट बन जाते हैं।
- अधिकतम 100 डेटा पॉइंट। सभी मान शून्य या उससे अधिक होने चाहिए।
- इनपुट फ़ॉर्मेट की परवाह किए बिना आउटपुट हमेशा एक PNG इमेज होता है।
