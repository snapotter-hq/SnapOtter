---
description: "計算維持長寬比所缺的寬度或高度，並化簡比例。"
i18n_source_hash: 2f975049563e
i18n_provenance: machine
i18n_output_hash: c227e507be68
i18n_hash_version: 2
---

# 長寬比計算器 {#aspect-ratio-calculator}

輸入原始寬度與高度，再輸入新的寬度或新的高度，即可取得另一邊的值，讓比例維持不變。比例會以最簡形式回傳，因此 1920 × 1080 即 16:9。在網頁應用程式中，你可以從常用比例（16:9、4:3、3:2、1:1、21:9、9:16、4:5）開始，並在橫向與直向之間切換。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/aspect-ratio-calculator`

接受 JSON 主體，而非 multipart form data，回應的是數字而不是可下載的檔案。

## Parameters {#parameters}

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `width` | number | （必填） | 原始寬度。 |
| `height` | number | （必填） | 原始高度。 |
| `newWidth` | number | - | 目標寬度。回應會據此求出 `newHeight`。 |
| `newHeight` | number | - | 目標高度。回應會據此求出 `newWidth`。 |
| `round` | boolean | `true` | 將求出的邊四捨五入為整數。當 `false` 時，保留兩位小數。 |

每個尺寸都必須介於 `0.0001` 與 `1000000` 之間。請傳送 `newWidth` 或 `newHeight`，不要同時傳送。兩者都省略時，只會回傳化簡後的比例。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/aspect-ratio-calculator \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"width": 1920, "height": 1080, "newWidth": 1280}'
```

## Example Response {#example-response}

```json
{
  "width": 1920,
  "height": 1080,
  "ratio": "16:9",
  "ratioDecimal": 1.7778,
  "newWidth": 1280,
  "newHeight": 720
}
```

當請求兩者都未傳送時，`newWidth` 與 `newHeight` 為 `null`。

## Notes {#notes}

- 小數尺寸會以最多四位小數化為整數比例，因此 `8.5` × `11` 會回傳為 `17:22`。
- `ratioDecimal` 是寬度除以高度，四捨五入至四位小數。
- 求出的邊不會回傳 `0`。開啟四捨五入時至少為 `1`，關閉時至少為 `0.01`。
- 同時傳送 `newWidth` 與 `newHeight`，或傳送超出允許範圍的尺寸，會回傳 400。
- 計算器不會讀取或寫入任何檔案。若要套用這些數值，請使用[調整影像大小](/zh-TW/tools/image/resize)或[裁切影像](/zh-TW/tools/image/crop)。
