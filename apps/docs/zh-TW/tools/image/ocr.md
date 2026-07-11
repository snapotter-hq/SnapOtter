---
description: "使用 AI 驅動的光學字元辨識從圖片擷取文字。"
i18n_source_hash: 3d85d423b82c
i18n_provenance: human
i18n_output_hash: 3b9f7c3af638
---

# OCR／文字擷取 {#ocr-text-extraction}

使用 AI 驅動的光學字元辨識從圖片擷取文字。支援多種語言與品質層級。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/image/ocr`

**處理方式：** 同步 JSON 回應。若提供 `clientJobId`，也會透過 SSE 回報進度。

**模型套件包：** `ocr`（5-6 GB）

## 參數 {#parameters}

| 參數 | 類型 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| file | file | 是 | - | 圖片檔案（multipart） |
| quality | string | 否 | `"balanced"` | 品質層級：`fast`（Tesseract）、`balanced`（PaddleOCR v5）、`best`（PaddleOCR VL） |
| language | string | 否 | `"auto"` | 語言提示：`auto`、`en`、`de`、`fr`、`es`、`zh`、`ja`、`ko` |
| enhance | boolean | 否 | `true` | 預先處理圖片以提高 OCR 準確度 |
| engine | string | 否 | - | 已淘汰。請改用 `quality`。將 `tesseract` 對應至 `fast`，將 `paddleocr` 對應至 `balanced` |

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/ocr \
  -F "file=@document.png" \
  -F 'settings={"quality":"best","language":"en","enhance":true}'
```

## 回應（200 OK） {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "filename": "document.png",
  "text": "Extracted text content from the image...",
  "engine": "paddleocr-vl"
}
```

### 進度（SSE，選用） {#progress-sse-optional}

若提供 `clientJobId` 表單欄位，則會串流傳送進度事件：

```
event: progress
data: {"phase":"processing","stage":"Recognizing text...","percent":50}
```

## 注意事項 {#notes}

- 需要安裝 `ocr` 模型套件包（5-6 GB）。
- OCR 會直接傳回擷取的文字，而非圖片下載 URL。
- 使用備援鏈結：若較高品質的層級當機（例如 PaddleOCR segfault），會自動以下一個較低層級重試。
- 若某層級傳回空白文字但未當機，也會退回至下一個層級。
- 品質層級對應各引擎：`fast` = Tesseract、`balanced` = PaddleOCR v5、`best` = PaddleOCR VL。
- 透過自動解碼支援 HEIC/HEIF、RAW、TGA、PSD、EXR 與 HDR 輸入格式。
