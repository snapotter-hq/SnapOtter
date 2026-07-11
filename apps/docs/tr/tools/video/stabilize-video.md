---
description: "İki geçişli sabitleme ile kamera sarsıntısını azaltın."
i18n_source_hash: ec908e91a752
i18n_provenance: human
i18n_output_hash: e02fb70adf8b
---

# Stabilize Video {#stabilize-video}

FFmpeg'in iki geçişli vidstab sabitlemesini kullanarak elde çekilmiş görüntülerdeki kamera sarsıntısını azaltın.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/stabilize-video`

Bir video dosyası ve bir JSON `settings` alanı içeren multipart form data kabul eder. Bu asenkron bir uç noktadır; hemen `202 Accepted` döndürür ve ilerleme `GET /api/v1/jobs/{jobId}/progress` adresinde SSE ile aktarılır.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| smoothing | integer | No | `15` | Kare cinsinden yumuşatma penceresi boyutu (5-60). Daha yüksek değerler daha yumuşak hareket üretir |

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

- Sabitleme iki geçişli bir süreçtir: ilk geçiş kamera hareketini analiz eder, ikinci geçiş düzeltmeyi uygular. Bu, tek geçişli araçlara göre kabaca iki kat daha uzun sürer.
- Daha yüksek yumuşatma değerleri daha fazla sarsıntı giderir ancak kenarlarda hafif bir yakınlaştırma kırpması getirebilir.
- İş tamamlanana kadar ilerleme güncellemeleri `GET /api/v1/jobs/{jobId}/progress` adresinde SSE ile sunulur.
