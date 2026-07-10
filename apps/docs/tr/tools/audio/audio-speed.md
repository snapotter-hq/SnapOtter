---
description: "Bir çarpanla ses oynatmayı hızlandırın veya yavaşlatın."
i18n_source_hash: e39ba662e594
i18n_provenance: human
i18n_output_hash: 14e07fbc6592
---

# Audio Speed {#audio-speed}

Bir hız çarpanı uygulayarak ses oynatmayı hızlandırın veya yavaşlatın.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/audio/audio-speed`

Bir ses dosyası ve bir JSON `settings` alanı içeren multipart form verisini kabul eder.

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| factor | number | Hayır | `1.5` | Hız çarpanı (0.25 ile 4 arası). 1'in altındaki değerler yavaşlatır; üstündekiler hızlandırır. |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-speed \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"factor": 2}'
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 2250000
}
```

## Notlar {#notes}

- `0.25` çarpanı çeyrek hızda oynatır (4 kat daha uzun). `4` çarpanı dört kat hızda oynatır (4 kat daha kısa).
- Hız değişirken perde (pitch) korunur (zaman esnetme). Perdeyi bağımsız olarak ayarlamak için perde kaydırmayı (pitch-shift) kullanın.
- Çıktı genellikle girdi konteynerini korur. AAC girdisi M4A olarak yazılır ve desteklenmeyen yalnızca-çözümleme (decode-only) girdileri MP3'e geri döner.
