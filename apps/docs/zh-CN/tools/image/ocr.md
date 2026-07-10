---
description: "使用基于 AI 的光学字符识别从图片中提取文本。"
i18n_source_hash: 3d85d423b82c
i18n_provenance: human
i18n_output_hash: ae14f7fe10d3
---

# OCR / 文本提取 {#ocr-text-extraction}

使用基于 AI 的光学字符识别从图片中提取文本。支持多种语言和质量档位。

## API 端点 {#api-endpoint}

`POST /api/v1/tools/image/ocr`

**处理方式：** 同步 JSON 响应。若提供了 `clientJobId`，则进度也会通过 SSE 上报。

**模型包：** `ocr`（5-6 GB）

## 参数 {#parameters}

| 参数 | 类型 | 是否必填 | 默认值 | 说明 |
|-----------|------|----------|---------|-------------|
| file | file | 是 | - | 图片文件（multipart） |
| quality | string | 否 | `"balanced"` | 质量档位：`fast`（Tesseract）、`balanced`（PaddleOCR v5）、`best`（PaddleOCR VL） |
| language | string | 否 | `"auto"` | 语言提示：`auto`、`en`、`de`、`fr`、`es`、`zh`、`ja`、`ko` |
| enhance | boolean | 否 | `true` | 对图片进行预处理以提高 OCR 准确度 |
| engine | string | 否 | - | 已弃用。请改用 `quality`。将 `tesseract` 映射为 `fast`，将 `paddleocr` 映射为 `balanced` |

## 请求示例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/ocr \
  -F "file=@document.png" \
  -F 'settings={"quality":"best","language":"en","enhance":true}'
```

## 响应（200 OK） {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "filename": "document.png",
  "text": "Extracted text content from the image...",
  "engine": "paddleocr-vl"
}
```

### 进度（SSE，可选） {#progress-sse-optional}

若提供了 `clientJobId` 表单字段，则会流式传输进度事件：

```
event: progress
data: {"phase":"processing","stage":"Recognizing text...","percent":50}
```

## 说明 {#notes}

- 需要安装 `ocr` 模型包（5-6 GB）。
- OCR 直接返回提取的文本，而不是图片下载 URL。
- 采用回退链：若某个较高质量的档位崩溃（例如 PaddleOCR 段错误），会自动使用下一个较低档位重试。
- 若某个档位未崩溃但返回了空文本，也会回退到下一个档位。
- 质量档位对应引擎：`fast` = Tesseract，`balanced` = PaddleOCR v5，`best` = PaddleOCR VL。
- 通过自动解码支持 HEIC/HEIF、RAW、TGA、PSD、EXR 和 HDR 输入格式。
