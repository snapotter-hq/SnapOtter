---
description: "Yapay zeka kullanarak video ses parçalarından altyazı dosyaları oluşturun."
i18n_source_hash: 35b1e78501ad
i18n_provenance: human
i18n_output_hash: 2f7dadee58ad
---

# Otomatik Altyazılar {#auto-subtitles}

Yapay zeka destekli konuşma tanıma (faster-whisper) kullanarak bir videonun ses parçasından altyazı dosyaları oluşturun. Otomatik algılamayı ve 10 açık dili destekler.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/video/auto-subtitles`

Bir video dosyası ve bir JSON `settings` alanı içeren multipart form verisini kabul eder. Bu, eşzamansız bir uç noktadır - hemen `202 Accepted` döndürür ve ilerleme `GET /api/v1/jobs/{jobId}/progress` adresinde SSE üzerinden akışla iletilir.

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| language | string | Hayır | `"auto"` | Konuşma dili: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| format | string | Hayır | `"srt"` | Çıktı altyazı biçimi: `srt`, `vtt` |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/auto-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"language": "en", "format": "srt"}'
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notlar {#notes}

- Bu, **transkripsiyon** özellik paketinin kurulu olmasını gerektiren bir yapay zeka aracıdır. Paket kurulu değilse API, yönetici arayüzü üzerinden nasıl kurulacağına dair talimatlarla birlikte `501 Feature Not Installed` döndürür.
- `auto` dil seçeneği whisper'ın yerleşik dil algılamasını kullanır. Dili açıkça belirtmek doğruluğu ve hızı artırır.
- SRT en yaygın desteklenen altyazı biçimidir. VTT (WebVTT) web video oynatıcıları için standarttır.
- İş tamamlanana kadar ilerleme güncellemeleri `GET /api/v1/jobs/{jobId}/progress` adresinde SSE üzerinden alınabilir.
