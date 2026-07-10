---
description: "在 PDF 的每一頁加上文字浮水印。"
i18n_source_hash: f1f7d8912fbd
i18n_provenance: human
i18n_output_hash: 9e642922db99
---

# 浮水印 PDF {#watermark-pdf}

在 PDF 的每一頁蓋上文字浮水印，並可設定位置、大小、不透明度與旋轉。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/pdf/watermark-pdf`

接受包含 PDF 檔案與 JSON `settings` 欄位的 multipart 表單資料。

## 參數 {#parameters}

| 參數 | 類型 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| text | string | 是 | - | 浮水印文字（1-200 個字元） |
| position | string | 否 | `"c"` | 在頁面上的放置位置：`tl`、`tc`、`tr`、`l`、`c`、`r`、`bl`、`bc`、`br` |
| fontSize | integer | 否 | `48` | 以點為單位的字型大小（6-72） |
| opacity | number | 否 | `0.3` | 浮水印不透明度（0.05-1） |
| rotation | number | 否 | `45` | 以度為單位的旋轉角度（-180 至 180） |

### 位置值 {#position-values}

- `tl` 左上、`tc` 上方置中、`tr` 右上
- `l` 中間偏左、`c` 置中、`r` 中間偏右
- `bl` 左下、`bc` 下方置中、`br` 右下

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/watermark-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"text": "CONFIDENTIAL", "position": "c", "opacity": 0.2, "rotation": 45}'
```

## 範例回應 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2500000
}
```

## 注意事項 {#notes}

- 浮水印會以文字疊加層的形式渲染在每一頁上。
- 相同的浮水印文字、位置與樣式會一致地套用到所有頁面。
- 使用較低的不透明度值（0.1-0.3）可製作不遮蔽內容的細緻浮水印。
