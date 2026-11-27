---
description: "解三率法（比例）問題，由三個已知值求出 X。"
i18n_source_hash: e0c21822bdae
i18n_provenance: machine
i18n_output_hash: 7f95200d6a76
i18n_hash_version: 2
---

# Proportion Calculator {#proportion-calculator}

解三率法（交叉相乘）問題。輸入三個值，選擇正比或反比，即可得到第四個值。每次得出答案後，這些值仍保留在表單中，因此可以修改其中一個數字並按 Enter 鍵繼續試算。

這是數學比例求解器，不是攝影構圖用的三分法格線。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/proportion-calculator`

接受 JSON 請求本文而非 multipart 表單資料，並回傳一個數字，而不是可下載的檔案。

## Parameters {#parameters}

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `a` | number | （必填） | 第一個已知值。 |
| `b` | number | （必填） | 與 `a` 對應的值。 |
| `c` | number | （必填） | 第三個已知值。X 是與它對應的值。 |
| `mode` | string | `direct` | `direct` 或 `inverse`。 |

| Mode | Reads as | Formula | Example |
|------|----------|---------|---------|
| `direct` | A 比 B 等於 C 比 X | X = B × C ÷ A | 3 顆蘋果價格為 6，所以 10 顆蘋果價格為 20 |
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

- 答案會四捨五入到 15 位有效數字，因此 `0.1 × 3 ÷ 3` 回傳的是 `0.1`，而不是 `0.10000000000000002`。
- 在正比例中 `a` 不能為 `0`，在反比例中 `c` 不能為 `0`，因為它們各自是除數。兩種情況都會回傳 400。
- 超出 double 可表示範圍的答案（大於約 `1.8e308`，或過於接近零而無法保持精度）會回傳 400。
- 在網頁應用程式中可以輸入 `1,5` 或 `1.5`，也支援阿拉伯-印度數字與天城文數字。不接受千位分隔符號。
