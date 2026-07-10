---
description: "將響度均化到廣播標準等級（EBU R128）。"
i18n_source_hash: 794d8cfa5ad8
i18n_provenance: human
i18n_output_hash: e0e9cb69d7f3
---

# 正規化音訊 {#normalize-audio}

使用 EBU R128 正規化（-16 LUFS）將音訊響度均化到廣播標準等級。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/audio/normalize-audio`

接受包含一個音訊檔案與一個 JSON `settings` 欄位的 multipart form data。

## 參數 {#parameters}

此工具沒有可設定的參數。它會自動套用 EBU R128 響度正規化。

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/normalize-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3"
```

## 範例回應 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 4500000
}
```

## 附註 {#notes}

- 使用 EBU R128 響度標準，目標為 -16 LUFS。
- 非常適合 podcast、有聲書以及重視響度一致性的廣播內容。
- 來源取樣率會在輸出中保留。
- 輸出通常會保留輸入的容器格式。AAC 輸入會寫成 M4A，而僅能解碼但不受支援的輸入會退回 MP3。
