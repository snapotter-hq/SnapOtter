---
description: "Altyazı dosyalarını SRT, WebVTT ve ASS arasında dönüştürün."
i18n_source_hash: 497ff19cf9be
i18n_provenance: machine
i18n_output_hash: 024a09679bf9
i18n_hash_version: 2
---

# Altyazı Dönüştür {#convert-subtitles}

Bir altyazı dosyasını SRT, WebVTT ve ASS arasında dönüştürün. Zamanlama ve metin aktarılır; ASS konumlandırması ve efektleri aktarılmaz.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/video/convert-subtitles`

Bir altyazı dosyası (`.srt`, `.vtt` veya `.ass`) ve isteğe bağlı bir JSON `settings` alanı içeren multipart form verisini kabul eder.

## Parametreler {#parameters}

| Parametre | Tür | Varsayılan | Açıklama |
|-----------|------|---------|-------------|
| `format` | string | `"srt"` | Çıktı formatı: `srt`, `vtt` veya `ass` |
| `encoding` | string | `"auto"` | Girdinin metin kodlaması: `auto`, `utf-8`, `windows-1252`, `windows-1250`, `windows-1251`, `windows-1256`, `iso-8859-2`, `gb18030`, `big5`, `shift_jis` veya `euc-kr` |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/convert-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@episode.ass" \
  -F 'settings={"format":"srt"}'
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/episode.srt",
  "originalSize": 2048,
  "processedSize": 1536
}
```

## Notlar {#notes}

- ASS'den dönüştürürken zamanlama, diyalog metni ve hedef formatın taşıyabildiği temel biçimlendirme korunur: SRT italik, kalın, renk ve yazı tipi boyutunu etiket olarak, WebVTT ise italik, kalın ve altı çizili biçimlendirmeyi korur. Ekrandaki konumlandırma, animasyon ve diğer ASS efektleri atılır.
- Çıktı her zaman UTF-8'dir. `encoding` `auto` olarak ayarlandığında, geçerli UTF-8 olan bir dosya olduğu gibi okunur, geri kalan her şey eski Batı Avrupa SRT dosyalarının olağan kodlaması olan Windows-1252 olarak okunur. Aksanlı veya Latin olmayan karakterler bozuk çıkarsa, `encoding` değerini dosyanın gerçek kodlamasına ayarlayın (örneğin Basitleştirilmiş Çince için `gb18030` veya Kiril için `windows-1251`).
- Altyazı yüklemeleri varsayılan olarak 1 MB ile sınırlıdır. Sınırı `MAX_SUBTITLE_SIZE_MB` ile yükseltebilir veya kaldırabilirsiniz.
