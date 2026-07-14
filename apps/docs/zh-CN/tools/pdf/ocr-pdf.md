---
description: "使用内置 Tesseract 或可选的高精度 RapidOCR 运行时从本地扫描的 PDF 中提取文本。"
i18n_output_hash: e2437a0ab8cf
i18n_source_hash: a19ba25a1ca8
i18n_provenance: human
---

# PDF OCR {#pdf-ocr}

从扫描的 PDF 文档中逐页提取文本，无需将 PDF 发送到外部服务。内置 `fast` 层使用 Tesseract。可选的 `balanced` 和 `best` 层使用 RapidOCR 和固定的 PP-OCR ONNX 模型。


<!-- korean-ocr-contract:start -->
::: info 韩语 OCR 兼容性
快速 OCR 支持 `auto`、`en`、`de`、`es`、`fr`、`zh` 和 `ja`，但不支持韩语 (`ko`)。韩语需要精确 OCR 包以及 `balanced` 或 `best`。该包可在官方 Linux amd64 和 arm64 容器上运行；即使是 NVIDIA 主机，OCR 仍使用 CPU。不受支持的系统会返回明确的兼容性错误，绝不会静默回退到 `fast`。韩语与 `fast` 或旧版 `tesseract` 别名的组合会在入队前以 `FEATURE_INCOMPATIBLE` 和 `fast-korean-unsupported` 拒绝。
:::
<!-- korean-ocr-contract:end -->
## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/ocr-pdf`

接受包含一个 PDF 文件和一个可选的 JSON `settings` 字段的 multipart 表单数据。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | 是的 | - | PDF 文件（多部分），最多 512 个 MiB 编码；较低的运营商上传限制仍然适用 |
| quality | string | 不 | 动态的 | OCR 质量等级：`fast`、`balanced` 或 `best` |
| language | string | No | `"auto"` | 文档语言：`auto`、`en`、`de`、`fr`、`es`、`zh`、`ja`、`ko` |
| pages | string | No | `"all"` | 页面选择，例如 `"all"`、`"1-3"`、`"1,3,5"` |
| enhance | boolean | 不 | 取决于层级 | 提高识别前的局部对比度。快速直接应用；仅当校准评分改善结果时，平衡和最佳才会保留变体。对于 `best` 默认为 `true`，对于 `fast`/`balanced` 默认为 `false` |
| engine | string | 不 | - | 已弃用的兼容性别名。请改用 `quality`。 `tesseract` 映射到 `fast`；旧版 `paddleocr` 值映射到 `balanced` 但不加载 PaddlePaddle |

省略 `quality` 和 `engine` 时，SnapOtter 会按 `best`、`balanced`、`fast` 的顺序选择可用的最高质量层。韩语绝不会选择 `fast`；它会使用 `best`，其次是 `balanced`，否则返回精确运行时的安装或兼容性错误。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/ocr-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@scanned.pdf" \
  -F 'settings={"quality": "best", "language": "en", "pages": "1-5", "enhance": true}'
```

## Example Response {#example-response}

返回 `202 Accepted`。通过 SSE 在 `/api/v1/jobs/{jobId}/progress` 跟踪进度。

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- 接受的输入格式：`.pdf`。
- 内置`fast`，并在官方镜像中添加了约25个 MiB。 `balanced` 和 `best` 需要可选的精确 OCR 包（大约下载 208-234 MiB 并安装 409-488 MiB，具体取决于目标）。
- 准确包支持 Linux amd64 和 arm64，并在 CPU（包括 NVIDIA 主机）上使用 ONNX Runtime。
- 明确请求的等级绝不会默默降级。如果 `balanced` 或 `best` 不可用，则 API 返回 `501` 和 `FEATURE_NOT_INSTALLED` 或 `FEATURE_INCOMPATIBLE`。
- PDF 页面在 OCR 之前以高分辨率进行光栅化。 `best` 运行更高精度的中型 PP-OCRv6 模型，并对方向和增强变体进行评分，以速度为代价提高识别能力。
- `auto` 语言设置可以跨支持的脚本集进行识别；明确的提示可以改善已知文档语言的结果。
- 你可以使用范围（`"1-3"`）、逗号分隔的列表（`"1,3,5"`）或 `"all"` 来针对特定页面处理所有页面。
- 一个请求最多可以处理 50 个页面。光栅化暂存数据的上限为 512 MiB，聚合 UTF-8 OCR 响应的上限为 1,000,000 字节；超出限制的作业失败而不是返回部分文本。
- 对于已经包含可选择文本的 PDF，请考虑改用更快的 [PDF to Text](./pdf-to-text) 工具。
