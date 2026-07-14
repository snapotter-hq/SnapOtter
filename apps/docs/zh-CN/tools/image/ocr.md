---
description: "使用内置 Tesseract 或可选的高精度 RapidOCR 运行时从本地图像中提取文本。"
i18n_output_hash: b452e084e28a
i18n_source_hash: 01c6fa6aebe7
i18n_provenance: human
---

# OCR / 文本提取 {#ocr-text-extraction}

从图像中提取文本，而不将图像发送到外部服务。内置 `fast` 层使用 Tesseract。可选的 `balanced` 和 `best` 层使用 RapidOCR 和固定的 PP-OCR ONNX 模型。


<!-- korean-ocr-contract:start -->
::: info 韩语 OCR 兼容性
快速 OCR 支持 `auto`、`en`、`de`、`es`、`fr`、`zh` 和 `ja`，但不支持韩语 (`ko`)。韩语需要精确 OCR 包以及 `balanced` 或 `best`。该包可在官方 Linux amd64 和 arm64 容器上运行；即使是 NVIDIA 主机，OCR 仍使用 CPU。不受支持的系统会返回明确的兼容性错误，绝不会静默回退到 `fast`。韩语与 `fast` 或旧版 `tesseract` 别名的组合会在入队前以 `FEATURE_INCOMPATIBLE` 和 `fast-korean-unsupported` 拒绝。
:::
<!-- korean-ocr-contract:end -->
## API 端点 {#api-endpoint}

`POST /api/v1/tools/image/ocr`

**处理：** 当 OCR 在同步窗口内完成时，返回 `200` 和 JSON。较长的作业返回 `202`；跟随作业的 SSE 进度流到达其终止事件，其 `result` 包含相同的 OCR 字段。

**准确的 OCR 包：** 可选的 `ocr` 运行时（大约下载 208-234 MiB 并安装 409-488 MiB，具体取决于目标）。 `fast` 不需要此包；安装程序会验证签名索引所限制的确切大小。

## 参数 {#parameters}

| 参数 | 类型 | 是否必填 | 默认值 | 说明 |
|-----------|------|----------|---------|-------------|
| file | file | 是的 | - | 图像文件（多部分），最多 512 MiB 编码和 40 兆像素解码；较低的运营商上传限制仍然适用 |
| quality | string | 不 | 动态的 | 质量等级：`fast` (Tesseract)、`balanced`（带有小型 PP-OCRv6 模型的 RapidOCR）或 `best`（具有校准变量评分的更高精度中型 PP-OCRv6 模型） |
| language | string | 否 | `"auto"` | 语言提示：`auto`、`en`、`de`、`fr`、`es`、`zh`、`ja`、`ko` |
| enhance | boolean | 不 | 取决于层级 | 提高识别前的局部对比度。快速直接应用；仅当校准评分改善结果时，平衡和最佳才会保留变体。对于 `best` 默认为 `true`，对于 `fast`/`balanced` 默认为 `false` |
| engine | string | 不 | - | 已弃用的兼容性别名。请改用 `quality`。 `tesseract` 映射到 `fast`；旧版 `paddleocr` 值映射到 `balanced` 但不加载 PaddlePaddle |

省略 `quality` 和 `engine` 时，SnapOtter 会按 `best`、`balanced`、`fast` 的顺序选择可用的最高质量层。韩语绝不会选择 `fast`；它会使用 `best`，其次是 `balanced`，否则返回精确运行时的安装或兼容性错误。

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
  "engine": "rapidocr-onnx",
  "requestedQuality": "best",
  "actualQuality": "best",
  "device": "cpu",
  "provider": "CPUExecutionProvider",
  "degraded": false,
  "warnings": [],
  "runtimeVersion": "2.1.0",
  "modelVersion": "PP-OCRv6-best-v1-medium"
}
```

### 进度（SSE，可选） {#progress-sse-optional}

如果提供了 `clientJobId` 表单字段，则会流式传输进度事件。 `202` 响应意味着客户端应保持流打开，直到终端 `complete` 或 `failed` 事件：

```
event: progress
data: {"phase":"processing","stage":"Recognizing text...","percent":50}
```

## 说明 {#notes}

- `fast` 在支持的 SnapOtter 映像中始终可用。 `balanced` 和 `best` 需要可选的精确 OCR 包。
- 内置 Tesseract 在官方镜像上增加了约25个 MiB。准确的包存储在 `/data/ai` 中，而不是烘焙到映像中。
- 官方 Linux amd64 和 arm64 容器的准确包装已发布。 它特意使用 ONNX Runtime 的 CPU 提供程序（包括在 NVIDIA 主机上），因此它不依赖于 CUDA 库或 GPU 兼容性。 源和预构建的 bare-metal 安装使用 Fast OCR，除非它们提供自己的兼容运行时。
- OCR 直接返回提取的文本，而不是图片下载 URL。
- SnapOtter 遵循明确要求的等级。如果`balanced`或`best`不可用，则 API 返回`501`和`FEATURE_NOT_INSTALLED`或`FEATURE_INCOMPATIBLE`；它永远不会默默地将请求降级到另一层。
- 成功的空结果仍然是空结果。运行时失败会返回错误，而不是使用较低质量的引擎重试。
- 响应报告 `requestedQuality` 和 `actualQuality`，以及引擎、设备、提供程序、运行时和模型版本以及任何警告。
- 通过自动解码支持 HEIC/HEIF、RAW、TGA、PSD、EXR 和 HDR 输入格式。
- 超大编码输入返回 `413`。超过 40 兆像素的图像和超过其有限输出限制的 OCR 响应将被拒绝，而不是部分处理。
