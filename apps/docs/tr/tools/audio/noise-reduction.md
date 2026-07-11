---
description: "FFT tabanlı gürültü giderme ile sesteki arka plan gürültüsünü azaltın."
i18n_source_hash: 57cbdbd449aa
i18n_provenance: human
i18n_output_hash: 1a57429f8c46
---

# Noise Reduction {#noise-reduction}

Seçilebilir güçle FFT tabanlı gürültü giderme kullanarak bir ses dosyasındaki arka plan gürültüsünü azaltın.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/audio/noise-reduction`

Bir ses dosyası ve bir JSON `settings` alanı içeren multipart form verisini kabul eder.

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| strength | string | Hayır | `"medium"` | Gürültü giderme gücü: `light`, `medium`, `strong` |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/noise-reduction \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"strength": "strong"}'
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 4500000
}
```

## Notlar {#notes}

- `light` daha fazla ayrıntı korur ancak daha az gürültü giderir. `strong` daha fazla gürültü giderir ancak ince yapaylıklar (artifact) katabilir.
- Tutarlı arka plan gürültüsü (fan uğultusu, klima, statik) içeren kayıtlarda en iyi sonuçları verir.
- Çıktı genellikle girdi konteynerini korur. AAC girdisi M4A olarak yazılır ve desteklenmeyen yalnızca-çözümleme (decode-only) girdileri MP3'e geri döner.
