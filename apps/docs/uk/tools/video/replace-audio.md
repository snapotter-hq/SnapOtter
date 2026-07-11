---
description: "Замінює аудіодоріжку відео іншим файлом."
i18n_source_hash: fabc2a953103
i18n_provenance: human
i18n_output_hash: e6e3c8690f9b
---

# Replace Audio {#replace-audio}

Замінює аудіодоріжку відео аудіофайлом. Завантажте і відео, і аудіофайл.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/replace-audio`

Приймає дані форми multipart рівно з двома файлами: відеофайлом, за яким іде аудіофайл.

## Parameters {#parameters}

Цей інструмент не має параметрів налаштувань. Завантажте відеофайл і аудіофайл як дві частини `file`.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/replace-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F "file=@voiceover.mp3"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 13100000
}
```

## Notes {#notes}

- Треба завантажити рівно два файли: перший має бути відео, другий має бути аудіофайлом.
- Якщо аудіофайл довший за відео, він обрізається до тривалості відео. Якщо коротший, решта відео відтворюється в тиші.
- Відеопотік копіюється без перекодування, тому втрати якості відео немає.
