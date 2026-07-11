---
description: "दो-पास स्थिरीकरण के साथ कैमरा शेक कम करें।"
i18n_source_hash: ec908e91a752
i18n_provenance: human
i18n_output_hash: 333c4e607715
---

# Stabilize Video {#stabilize-video}

FFmpeg के दो-पास vidstab स्थिरीकरण का उपयोग करके हैंडहेल्ड फ़ुटेज में कैमरा शेक कम करें।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/stabilize-video`

एक वीडियो फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है। यह एक async endpoint है - यह तुरंत `202 Accepted` लौटाता है और प्रगति `GET /api/v1/jobs/{jobId}/progress` पर SSE के माध्यम से स्ट्रीम की जाती है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| smoothing | integer | No | `15` | फ्रेम में स्मूदिंग विंडो आकार (5-60)। अधिक मान अधिक सहज गति देते हैं |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/stabilize-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"smoothing": 30}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- स्थिरीकरण एक दो-पास प्रक्रिया है: पहला पास कैमरा गति का विश्लेषण करता है, और दूसरा पास सुधार लागू करता है। इसमें सिंगल-पास टूल की तुलना में लगभग दोगुना समय लगता है।
- अधिक स्मूदिंग मान अधिक शेक हटाते हैं लेकिन किनारों पर हल्का ज़ूम क्रॉप ला सकते हैं।
- जॉब पूरा होने तक `GET /api/v1/jobs/{jobId}/progress` पर SSE के माध्यम से प्रगति अपडेट उपलब्ध रहते हैं।
