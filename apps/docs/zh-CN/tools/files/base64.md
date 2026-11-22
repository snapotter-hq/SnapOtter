---
description: "将文本编码为 Base64，或将 Base64 解码还原为文本。"
i18n_source_hash: 0e26f17348d3
i18n_provenance: machine
i18n_output_hash: 00c743547027
i18n_hash_version: 2
---

# Base64 Encode / Decode {#base64}

粘贴文本即可得到 Base64，粘贴 Base64 即可还原为文本，然后复制结果。文本只会发送到你自己的 SnapOtter 服务器，不会发往其他任何地方。

要将图片转换为 Base64，请改用 [Image to Base64](/zh-CN/tools/image/image-to-base64)。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/base64`

接受 JSON 请求体而非 multipart 表单数据，并返回转换后的文本，而不是可下载的文件。

## Parameters {#parameters}

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `text` | string | （必填） | 要编码的文本，或要解码的 Base64。最多 1,000,000 个字符。 |
| `mode` | string | （必填） | `encode` 或 `decode`。 |
| `urlSafe` | boolean | `false` | 编码时使用 URL 安全字符集（`-` 和 `_`），并省略 `=` 填充。解码时忽略。 |

## Example Request {#example-request}

编码：

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello, World!", "mode": "encode"}'
```

解码：

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

- 文本按 UTF-8 编码，因此带重音的字母、中日韩文字和 emoji 都能完整往返。
- 解码会忽略空格和换行，因此按 76 列换行的 Base64（电子邮件、PEM 正文）可以直接粘贴解码。
- 解码接受带或不带 `=` 填充的输入，标准字符集（`+`、`/`）和 URL 安全字符集（`-`、`_`）均可，但不能混用。
- 不是 Base64 的输入会以 400 和错误码 `ENCODED_TEXT_INVALID` 失败。有效的 Base64 若解码为二进制数据（图片、ZIP）而不是 UTF-8 文本，则以 `DECODED_DATA_NOT_TEXT` 失败。
