---
description: "将文本转换为大写、小写、标题格式、句首大写等。"
i18n_source_hash: e15ff31ec4d6
i18n_provenance: machine
i18n_output_hash: 9d6bd14e9475
i18n_hash_version: 2
---

# Convert Case {#convert-case}

粘贴文本，选择一种大小写格式，然后复制结果。文本只会发送到你自己的 SnapOtter 服务器，不会发往其他任何地方。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/convert-case`

接受 JSON 请求体而非 multipart 表单数据，并返回转换后的文本，而不是可下载的文件。

## Parameters {#parameters}

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `text` | string | （必填） | 要转换的文本。最多 1,000,000 个字符。 |
| `mode` | string | （必填） | 下列模式之一。 |
| `locale` | string | （无） | BCP 47 语言标签，例如 `tr` 或 `de`，用于大小写因语言而异的字母。不指定时，所有语言的大小写处理方式相同。 |

| Mode | Input | Output |
|------|-------|--------|
| `upper` | `The quick brown fox` | `THE QUICK BROWN FOX` |
| `lower` | `The Quick Brown Fox` | `the quick brown fox` |
| `sentence` | `the quick BROWN fox. it jumps.` | `The quick brown fox. It jumps.` |
| `title` | `the lord of the rings` | `The Lord of the Rings` |
| `capitalized` | `the lord of the rings` | `The Lord Of The Rings` |
| `inverse` | `The Quick Brown Fox` | `tHE qUICK bROWN fOX` |
| `alternating` | `the quick brown fox` | `tHe QuIcK bRoWn FoX` |
| `camel` | `The quick brown fox` | `theQuickBrownFox` |
| `pascal` | `the quick brown fox` | `TheQuickBrownFox` |
| `snake` | `The quick brown fox` | `the_quick_brown_fox` |
| `kebab` | `The quick brown fox` | `the-quick-brown-fox` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-case \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "the lord of the rings", "mode": "title"}'
```

## Example Response {#example-response}

```json
{
  "mode": "title",
  "result": "The Lord of the Rings"
}
```

## Notes {#notes}

- `title` 会让简短的英文单词（a、an、and、of、the、to 等）保持小写，除非它们位于行首或行尾。`capitalized` 会将每个单词的首字母大写。
- `sentence` 会在文本开头、换行之后，以及 `.`、`!`、`?` 或 `…` 后跟空格的位置开始新的句子，因此 `snapotter.com` 或 `3.5` 中的点不算数。
- `camel`、`pascal`、`snake` 和 `kebab` 会按空格、标点和已有的大小写变化处进行拆分（`XMLHttpRequest` 会变成 `xml_http_request`），并逐行单独转换。
- 当 `locale` 设为 `tr` 时，`i` 会转为大写 `İ`，`I` 会转为小写 `ı`。德语 `ß` 在所有语言区域中都会转为大写 `SS`。
- Web 应用会将当前界面语言作为 `locale` 发送。
