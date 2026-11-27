---
description: "解三率法（比例）问题，由三个已知值求出 X。"
i18n_source_hash: e0c21822bdae
i18n_provenance: machine
i18n_output_hash: 8ceb92894a78
i18n_hash_version: 2
---

# Proportion Calculator {#proportion-calculator}

解三率法（交叉相乘）问题。输入三个值，选择正比或反比，即可得到第四个值。每次得出答案后，这些值仍保留在表单中，因此可以改动其中一个数字并按 Enter 键继续试算。

这是数学比例求解器，不是摄影构图用的三分法网格。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/proportion-calculator`

接受 JSON 请求体而非 multipart 表单数据，并返回一个数字，而不是可下载的文件。

## Parameters {#parameters}

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `a` | number | （必填） | 第一个已知值。 |
| `b` | number | （必填） | 与 `a` 对应的值。 |
| `c` | number | （必填） | 第三个已知值。X 是与它对应的值。 |
| `mode` | string | `direct` | `direct` 或 `inverse`。 |

| Mode | Reads as | Formula | Example |
|------|----------|---------|---------|
| `direct` | A 比 B 等于 C 比 X | X = B × C ÷ A | 3 个苹果价格为 6，所以 10 个苹果价格为 20 |
| `inverse` | A × B = C × X | X = A × B ÷ C | 4 名工人需要 6 天，所以 8 名工人需要 3 天 |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/proportion-calculator \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"a": 3, "b": 6, "c": 10, "mode": "direct"}'
```

## Example Response {#example-response}

```json
{
  "mode": "direct",
  "x": 20
}
```

## Notes {#notes}

- 答案会四舍五入到 15 位有效数字，因此 `0.1 × 3 ÷ 3` 返回的是 `0.1`，而不是 `0.10000000000000002`。
- 在正比例中 `a` 不能为 `0`，在反比例中 `c` 不能为 `0`，因为它们各自是除数。两种情况都会返回 400。
- 超出 double 可表示范围的答案（大于约 `1.8e308`，或过于接近零而无法保持精度）会返回 400。
- 在 Web 应用中可以输入 `1,5` 或 `1.5`，也支持阿拉伯-印度数字和天城文数字。不接受千位分隔符。
