---
description: "Hızı değiştirmeden ses perdesini yarım tonlarla yükseltin veya düşürün."
i18n_source_hash: 2804d0eeecc8
i18n_provenance: human
i18n_output_hash: d2adc9bc2ba7
---

# Pitch Shift {#pitch-shift}

Bir ses dosyasının perdesini, oynatma hızını değiştirmeden belirli sayıda yarım ton yükseltin veya düşürün.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/audio/pitch-shift`

Bir ses dosyası ve bir JSON `settings` alanı içeren multipart form verisini kabul eder.

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| semitones | integer | Hayır | `3` | Kaydırılacak yarım ton (-12 ile 12 arası). Sıfır olmamalıdır. |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/pitch-shift \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"semitones": -5}'
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

- Pozitif değerler perdeyi yükseltir; negatif değerler düşürür.
- 12 yarım tonluk bir kaydırma bir oktav yukarıya eşittir; -12 bir oktav aşağıya eşittir.
- Kaydırma miktarından bağımsız olarak oynatma süresi aynı kalır.
- Çıktı genellikle girdi konteynerini korur. AAC girdisi M4A olarak yazılır ve desteklenmeyen yalnızca-çözümleme (decode-only) girdileri MP3'e geri döner.
