---
description: "Yapılandırılabilir konum, opaklık, döndürme ve döşemeyle metin filigranları ekleyin."
i18n_source_hash: b80f12f410e4
i18n_provenance: human
i18n_output_hash: e50e761ccf00
---

# Metin Filigranı {#text-watermark}

Görüntülere bir metin filigranı katmanı ekleyin. Köşelerde/merkezde tek yerleşimi veya tüm görüntü boyunca döşenmiş tekrarı, yapılandırılabilir yazı tipi boyutu, renk, opaklık ve döndürmeyle destekler.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/image/watermark-text`

Bir görüntü dosyası ve bir JSON `settings` alanı içeren multipart form verisini kabul eder.

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| text | string | Evet | - | Filigran metni (1 ile 500 karakter arası) |
| fontSize | number | Hayır | `48` | Piksel cinsinden yazı tipi boyutu (8 ile 1000 arası) |
| color | string | Hayır | `"#000000"` | Hex biçiminde metin rengi (`#RRGGBB`) |
| opacity | number | Hayır | `50` | Metin opaklık yüzdesi (0 ile 100 arası) |
| position | string | Hayır | `"center"` | Yerleşim: `center`, `top-left`, `top-right`, `bottom-left`, `bottom-right`, `tiled` |
| rotation | number | Hayır | `0` | Derece cinsinden metin döndürme açısı (-360 ile 360 arası) |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/watermark-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "SAMPLE", "fontSize": 64, "opacity": 30, "position": "center", "rotation": -30}'
```

Tüm görüntü boyunca döşenmiş filigran:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/watermark-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "DRAFT", "fontSize": 36, "opacity": 20, "position": "tiled", "rotation": -45}'
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2480000
}
```

## Notlar {#notes}

- Filigran, SVG metni olarak render edilir ve görüntü üzerine birleştirilir, çıktı kalitesini korur.
- Döşeme modu, metin öğelerini yazı tipi boyutuna göre aralıklar (6x yatay, 4x dikey aralık), en fazla 500 öğeyle sınırlandırılır.
- Köşe konumları için kenardan dolgu yazı tipi boyutuna eşittir.
- Kullanılan yazı tipi sistemin varsayılan sans-serif yazı tipidir.
- Metindeki XML özel karakterleri (`&`, `<`, `>`, `"`, `'`) güvenli bir şekilde kaçırılır.
- Çıktı biçimi giriş biçimiyle eşleşir. HEIC, RAW, PSD ve SVG girdileri işlenmeden önce otomatik olarak çözülür.
