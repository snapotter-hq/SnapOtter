---
description: "Yapay zeka destekli optik karakter tanıma kullanarak görsellerden metin çıkarın."
i18n_source_hash: 3d85d423b82c
i18n_provenance: human
i18n_output_hash: 441705d21655
---

# OCR / Metin Çıkarma {#ocr-text-extraction}

Yapay zeka destekli optik karakter tanıma kullanarak görsellerden metin çıkarın. Birden fazla dili ve kalite kademesini destekler.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/image/ocr`

**İşleme:** Eşzamanlı JSON yanıtı. `clientJobId` sağlanırsa ilerleme SSE aracılığıyla da bildirilir.

**Model paketi:** `ocr` (5-6 GB)

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| file | file | Evet | - | Görsel dosyası (çok parçalı) |
| quality | string | Hayır | `"balanced"` | Kalite kademesi: `fast` (Tesseract), `balanced` (PaddleOCR v5), `best` (PaddleOCR VL) |
| language | string | Hayır | `"auto"` | Dil ipucu: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| enhance | boolean | Hayır | `true` | Daha iyi OCR doğruluğu için görseli ön işleme tabi tut |
| engine | string | Hayır | - | Kullanımdan kaldırıldı. Bunun yerine `quality` kullanın. `tesseract` değerini `fast` ile, `paddleocr` değerini `balanced` ile eşler |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/ocr \
  -F "file=@document.png" \
  -F 'settings={"quality":"best","language":"en","enhance":true}'
```

## Yanıt (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "filename": "document.png",
  "text": "Extracted text content from the image...",
  "engine": "paddleocr-vl"
}
```

### İlerleme (SSE, isteğe bağlı) {#progress-sse-optional}

Bir `clientJobId` form alanı sağlanırsa, ilerleme olayları akıtılır:

```
event: progress
data: {"phase":"processing","stage":"Recognizing text...","percent":50}
```

## Notlar {#notes}

- `ocr` model paketinin kurulu olmasını gerektirir (5-6 GB).
- OCR, bir görsel indirme URL'si yerine doğrudan çıkarılan metni döndürür.
- Bir yedek zinciri kullanır: daha yüksek kaliteli bir kademe çökerse (örn. PaddleOCR segfault), otomatik olarak bir sonraki daha düşük kademeyle yeniden dener.
- Bir kademe çökmeden boş metin döndürürse, o da bir sonraki kademeye geri düşer.
- Kalite kademeleri motorlara eşlenir: `fast` = Tesseract, `balanced` = PaddleOCR v5, `best` = PaddleOCR VL.
- HEIC/HEIF, RAW, TGA, PSD, EXR ve HDR girdi biçimlerini otomatik çözme yoluyla destekler.
