---
description: "Birden fazla video klibini tek bir dosyada birleştirin."
i18n_source_hash: 90463dfbb580
i18n_provenance: human
i18n_output_hash: d352ffd30d9b
---

# Merge Videos {#merge-videos}

Birden fazla video klibini tek bir MP4 dosyasında birleştirin. Tüm girdiler, ilk videonun çözünürlüğüne ve 30 fps'ye normalize edilir.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/merge-videos`

İki veya daha fazla video dosyası içeren multipart form data kabul eder. Bu asenkron bir uç noktadır; hemen `202 Accepted` döndürür ve ilerleme `GET /api/v1/jobs/{jobId}/progress` adresinde SSE ile aktarılır.

## Parameters {#parameters}

Bu aracın ayar parametresi yoktur. 2-10 video dosyasını birden fazla `file` parçası olarak yükleyin.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/merge-videos \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@intro.mp4" \
  -F "file=@main.mp4" \
  -F "file=@outro.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Klipler yüklendikleri sıraya göre birleştirilir.
- Tüm klipler, ilk klibin çözünürlüğüne, kare hızına (30 fps) ve codec'ine (H.264) uyacak şekilde yeniden kodlanır. Uyumsuz girdiler otomatik olarak normalize edilir.
- İstek başına 2-10 video dosyası kabul eder.
- İş tamamlanana kadar ilerleme güncellemeleri `GET /api/v1/jobs/{jobId}/progress` adresinde SSE ile sunulur.
