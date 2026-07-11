---
description: "AI kullanarak görsel arka planını düz bir renk veya gradyanla değiştirin."
i18n_source_hash: 930fe8890e55
i18n_provenance: human
i18n_output_hash: 974354540f2e
---

# Arka Plan Değiştirme {#background-replace}

Bir görselin arka planını düz bir renk veya gradyanla değiştirin. AI modeli özneyi algılar, özgün arka planı kaldırır ve özneyi seçtiğiniz arka plan üzerine yerleştirir.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/image/background-replace`

Bir görsel dosyası ve bir JSON `settings` alanı içeren multipart form verisi kabul eder.

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| backgroundType | dize | Hayır | `"color"` | Arka plan modu: `color` veya `gradient` |
| color | dize | Hayır | `"#ffffff"` | Arka plan onaltılık rengi (backgroundType `color` olduğunda) |
| gradientColor1 | dize | Hayır | - | Birinci gradyan onaltılık rengi |
| gradientColor2 | dize | Hayır | - | İkinci gradyan onaltılık rengi |
| gradientAngle | tam sayı | Hayır | `180` | Derece cinsinden gradyan açısı (0-360) |
| feather | tam sayı | Hayır | `0` | Kenar yumuşatma yarıçapı (0-20) |
| format | dize | Hayır | `"png"` | Çıktı biçimi: `png` veya `webp` |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/background-replace \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"backgroundType": "color", "color": "#2563eb", "feather": 2}'
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
- HEIC, RAW, PSD ve SVG girişleri işlenmeden önce otomatik olarak çözülür.
- Öznenin çevresindeki saydamlığı korumak için çıktı varsayılan olarak PNG'dir.
