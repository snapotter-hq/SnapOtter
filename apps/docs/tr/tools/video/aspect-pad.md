---
description: "Hedef bir en boy oranına sığdırmak için düz renkli çubuklar ekleyin."
i18n_source_hash: b8e17dffc341
i18n_provenance: human
i18n_output_hash: a260f6057473
---

# En Boy Dolgusu {#aspect-pad}

Bir videoyu kırpmadan hedef bir en boy oranına sığdırmak için düz renkli letterbox veya pillarbox çubukları ekleyin.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/video/aspect-pad`

Bir video dosyası ve bir JSON `settings` alanı içeren multipart form verisini kabul eder.

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| target | string | Hayır | `"9:16"` | Hedef en boy oranı: `16:9`, `9:16`, `1:1`, `4:3`, `3:4` |
| color | string | Hayır | `"#000000"` | Dolgu çubukları için onaltılık renk (örn. siyah için `"#000000"`) |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/aspect-pad \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"target": "1:1", "color": "#ffffff"}'
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 13200000
}
```

## Notlar {#notes}

- Video zaten hedef en boy oranıyla eşleşiyorsa, dosya değiştirilmeden döndürülür.
- Dikey/portre sosyal medya biçimleri (TikTok, Reels, Shorts) için `9:16` kullanın.
- Düz renk yerine bulanık dolgu için Bulanık Dolgu aracını kullanın.
