---
description: "將文字編碼為 Base64，或將 Base64 解碼還原為文字。"
i18n_source_hash: 0e26f17348d3
i18n_provenance: machine
i18n_output_hash: 1bebe4184462
i18n_hash_version: 2
---

# Base64 Encode / Decode {#base64}

貼上文字即可得到 Base64，貼上 Base64 即可還原為文字，然後複製結果。文字只會傳送到您自己的 SnapOtter 伺服器，不會傳送到其他任何地方。

若要將圖片轉換為 Base64，請改用 [Image to Base64](/zh-TW/tools/image/image-to-base64)。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/base64`

接受 JSON 請求本文而非 multipart 表單資料，並回傳轉換後的文字，而不是可下載的檔案。

## Parameters {#parameters}

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `text` | string | （必填） | 要編碼的文字，或要解碼的 Base64。最多 1,000,000 個字元。 |
| `mode` | string | （必填） | `encode` 或 `decode`。 |
| `urlSafe` | boolean | `false` | 編碼時使用 URL 安全字元集（`-` 與 `_`），並省略 `=` 填補字元。解碼時會忽略。 |

## Example Request {#example-request}

編碼：

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello, World!", "mode": "encode"}'
```

解碼：

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "SGVsbG8sIFdvcmxkIQ==", "mode": "decode"}'
```

## Example Response {#example-response}

```json
{
  "mode": "encode",
  "result": "SGVsbG8sIFdvcmxkIQ=="
}
```

## Notes {#notes}

- 文字會以 UTF-8 編碼，因此帶重音的字母、中日韓文字與表情符號都能完整往返。
- 解碼會忽略空格與換行，因此以 76 欄換行的 Base64（電子郵件、PEM 內容）可直接貼上解碼。
- 解碼接受有或沒有 `=` 填補字元的輸入，標準字元集（`+`、`/`）與 URL 安全字元集（`-`、`_`）皆可，但不能混用。
- 不是 Base64 的輸入會以 400 與錯誤碼 `ENCODED_TEXT_INVALID` 失敗。有效的 Base64 若解碼為二進位資料（圖片、ZIP）而非 UTF-8 文字，則會以 `DECODED_DATA_NOT_TEXT` 失敗。
