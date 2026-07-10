---
description: "Birden çok ses dosyasını tek bir ardışık parçaya birleştirin."
i18n_source_hash: defa993d3f87
i18n_provenance: human
i18n_output_hash: 78e097ceb639
---

# Merge Audio {#merge-audio}

İki veya daha fazla ses dosyasını, yüklendikleri sırada birleştirilmiş tek bir ardışık parçada birleştirin.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/audio/merge-audio`

Birden çok ses dosyası ve bir JSON `settings` alanı içeren multipart form verisini kabul eder.

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| format | string | Hayır | `"mp3"` | Çıktı formatı: `mp3`, `wav`, `flac`, `m4a` |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/merge-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@intro.mp3" \
  -F "file=@main.mp3" \
  -F "file=@outro.mp3" \
  -F 'settings={"format": "mp3"}'
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.mp3",
  "originalSize": 9500000,
  "processedSize": 9200000
}
```

## Notlar {#notes}

- İstek başına 2 ile 10 ses dosyası kabul eder.
- Dosyalar yükleme sırasına göre birleştirilir.
- Tüm girdi dosyaları, kusursuz birleştirme için seçilen çıktı formatına ve örnekleme hızına yeniden kodlanır.
- Karışık girdi formatları desteklenir (ör. bir WAV ve bir MP3).
