---
description: "アスペクト比を保つために不足している幅または高さを求め、比率を約分します。"
i18n_source_hash: 2f975049563e
i18n_provenance: machine
i18n_output_hash: 472e224e8881
i18n_hash_version: 2
---

# アスペクト比計算機 {#aspect-ratio-calculator}

元の幅と高さを入力し、続けて新しい幅または新しい高さを入力すると、縦横比が変わらないようにもう一方の辺を返します。比率は最も簡単な形で返されるため、1920 × 1080 は 16:9 になります。Web アプリでは、一般的な比率 (16:9、4:3、3:2、1:1、21:9、9:16、4:5) から始めたり、横向きと縦向きを切り替えたりできます。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/aspect-ratio-calculator`

マルチパートフォームデータではなく JSON ボディを受け付け、ダウンロード用のファイルではなく数値を返します。

## Parameters {#parameters}

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `width` | number | (必須) | 元の幅。 |
| `height` | number | (必須) | 元の高さ。 |
| `newWidth` | number | - | 目標の幅。レスポンスはこの値から `newHeight` を求めます。 |
| `newHeight` | number | - | 目標の高さ。レスポンスはこの値から `newWidth` を求めます。 |
| `round` | boolean | `true` | 求めた辺を整数に丸めます。`false` の場合は小数点以下 2 桁を保持します。 |

すべての寸法は `0.0001` から `1000000` の範囲で指定してください。`newWidth` と `newHeight` は、どちらか一方だけを送信します。両方とも省略すると、約分した比率だけが返されます。

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

リクエストでどちらも送信しなかった場合、`newWidth` と `newHeight` は `null` になります。

## Notes {#notes}

- 小数のサイズは小数点以下 4 桁までを使って整数比に約分されるため、`8.5` × `11` は `17:22` として返されます。
- `ratioDecimal` は幅を高さで割った値で、小数点以下 4 桁に丸められます。
- 求めた辺が `0` として返されることはありません。丸めが有効な場合は最小で `1`、無効な場合は最小で `0.01` です。
- `newWidth` と `newHeight` の両方を送信した場合、または許可範囲外の寸法を送信した場合は 400 が返されます。
- この計算機はファイルを読み書きしません。算出した数値を適用するには、[画像リサイズ](/ja/tools/image/resize)または[画像クロップ](/ja/tools/image/crop)を使用してください。
