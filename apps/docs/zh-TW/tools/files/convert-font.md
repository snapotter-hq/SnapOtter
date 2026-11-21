---
description: "在 TTF、OTF、WOFF 與 WOFF2 之間轉換字型。"
i18n_source_hash: a17c8ef18e42
i18n_provenance: machine
i18n_output_hash: c92200ceff5c
i18n_hash_version: 2
---

# 轉換字型 {#convert-font}

在 TrueType (TTF)、OpenType CFF (OTF)、WOFF 與 WOFF2 之間轉換字型檔案。可以用來把桌面字型變成網頁字型，或為只接受 TrueType 的應用程式從 OTF 取得 TTF。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/files/convert-font`

接受包含 `.ttf`、`.otf`、`.woff` 或 `.woff2` 檔案以及 JSON `settings` 欄位的 multipart form data。

## 參數 {#parameters}

| 參數 | 類型 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| format | string | 否 | `ttf` | 輸出格式：`ttf`、`otf`、`woff` 或 `woff2` |

## 範例請求 {#example-request}

OTF 轉 TTF：

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-font \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@MyFont.otf" \
  -F 'settings={"format": "ttf"}'
```

TTF 轉 WOFF2（用於網頁）：

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-font \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@MyFont.ttf" \
  -F 'settings={"format": "woff2"}'
```

## 範例回應 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/MyFont.ttf",
  "originalSize": 48120,
  "processedSize": 61344
}
```

## 注意事項 {#notes}

- WOFF 與 WOFF2 是同一份字型資料的壓縮封裝，因此轉換成這兩種格式或從它們轉換出來都不會改變外框。
- OTF 轉 TTF 會把三次 (CFF) 曲線轉換成二次 TrueType 曲線。每條曲線與原始曲線的差距都在 1 個字型單位以內，在一般字級下看不出來，但這種轉換無法完全還原。TTF 轉 OTF 會保留曲線形狀，只把控制點四捨五入到整數字型單位。
- 字型的嵌入權限（OS/2 的 `fsType` 欄位）會維持原樣。
- 不支援字型集合 (`.ttc`)。可變 TrueType 字型無法轉換成 OTF，可變 CFF2 字型無法轉換成 TTF；請改為將它們轉換成 WOFF 或 WOFF2。
- 轉換在 Python 文件 worker 中執行，逾時時間與其他文件工具相同，不在 API 程序內執行。
