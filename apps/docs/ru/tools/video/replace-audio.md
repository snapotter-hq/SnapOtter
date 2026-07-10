---
description: "Замена аудиодорожки видео другим файлом."
i18n_source_hash: fabc2a953103
i18n_provenance: human
i18n_output_hash: d68201e31a7b
---

# Replace Audio {#replace-audio}

Замена аудиодорожки видео аудиофайлом. Загрузите и видео, и аудиофайл.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/replace-audio`

Принимает multipart form data ровно с двумя файлами: файл видео, за которым следует аудиофайл.

## Parameters {#parameters}

У этого инструмента нет параметров настройки. Загрузите файл видео и аудиофайл в виде двух частей `file`.

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

- Должно быть загружено ровно два файла: первым должно быть видео, вторым - аудиофайл.
- Если аудиофайл длиннее видео, он обрезается по длительности видео. Если короче, оставшаяся часть видео воспроизводится без звука.
- Видеопоток копируется без перекодирования, поэтому потери качества видео нет.
