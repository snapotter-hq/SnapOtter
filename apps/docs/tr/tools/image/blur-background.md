---
description: "AI kullanarak özneyi keskin tutarken arka planı bulanıklaştırın."
i18n_source_hash: 9073f10e6e9d
i18n_provenance: human
i18n_output_hash: 99348e4cfecf
---

# Arka Planı Bulanıklaştır {#blur-background}

Bir görselin arka planını, özneyi keskin tutarken bulanıklaştırın. AI modeli özneyi ayırır, özgün arka plana bir bulanıklık uygular ve keskin özneyi üzerine yerleştirir.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/image/blur-background`

Bir görsel dosyası ve bir JSON `settings` alanı içeren multipart form verisi kabul eder.

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| intensity | tam sayı | Hayır | `50` | Bulanıklık yoğunluğu (1-100) |
| feather | tam sayı | Hayır | `0` | Kenar yumuşatma yarıçapı (0-20) |
| format | dize | Hayır | `"png"` | Çıktı biçimi: `png` veya `webp` |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/blur-background \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"intensity": 75, "feather": 3}'
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

İlerlemeyi SSE üzerinden `GET /api/v1/jobs/{jobId}/progress` adresinden takip edin. İş tamamlandığında, SSE akışı indirme URL'sini içeren bir `completed` olayı yayar.

## Notlar {#notes}

- Bu, `202 Accepted` döndüren ve eşzamansız işleyen AI destekli bir araçtır. İlerleme güncellemelerini ve nihai sonucu almak için SSE uç noktasına bağlanın.
- **background-removal** özellik paketinin yüklü olmasını gerektirir. Paket mevcut değilse `501` döndürür.
- Daha yüksek yoğunluk değerleri daha güçlü bir bulanıklık efekti üretir. 80'in üzerindeki değerler belirgin, bokeh benzeri bir ayrım oluşturur.
- HEIC, RAW, PSD ve SVG girişleri işlenmeden önce otomatik olarak çözülür.
