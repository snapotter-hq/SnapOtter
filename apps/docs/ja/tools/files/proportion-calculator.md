---
description: "三数法を解き、3つの既知の値から X を求めます。"
i18n_source_hash: e0c21822bdae
i18n_provenance: machine
i18n_output_hash: 2e154f8eb119
i18n_hash_version: 2
---

# Proportion Calculator {#proportion-calculator}

三数法(比例式の内項と外項の積の関係)を解きます。3つの値を入力し、正比例か反比例かを選ぶと、4つ目の値が得られます。回答後も値はフォームに残るため、数値を1つ変えて Enter キーを押せば、次の計算を試せます。

これは数学の比例ソルバーであり、写真構図の三分割グリッドではありません。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/proportion-calculator`

multipart フォームデータではなく JSON ボディを受け付け、ダウンロード用のファイルではなく数値を返します。

## Parameters {#parameters}

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `a` | number | (必須) | 1つ目の既知の値。 |
| `b` | number | (必須) | `a` と対になる値。 |
| `c` | number | (必須) | 3つ目の既知の値。X はこれと対になる値です。 |
| `mode` | string | `direct` | `direct` または `inverse`。 |

| Mode | Reads as | Formula | Example |
|------|----------|---------|---------|
| `direct` | A と B の関係は、C と X の関係に等しい | X = B × C ÷ A | リンゴ 3 個で 6、なら 10 個で 20 |
| `inverse` | A × B = C × X | X = A × B ÷ C | 4 人で 6 日かかるなら、8 人では 3 日 |

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

- 答えは有効数字 15 桁に丸められるため、`0.1 × 3 ÷ 3` は `0.1` として返され、`0.10000000000000002` にはなりません。
- 正比例では `a` を `0` にできず、反比例では `c` を `0` にできません。それぞれが除数になるためです。どちらの場合も 400 を返します。
- double が保持できる範囲を超える答え(約 `1.8e308` を超える場合、または精度を保てないほど 0 に近い場合)は 400 を返します。
- Web アプリでは `1,5` や `1.5` と入力でき、アラビア・インド数字やデーヴァナーガリー数字も使えます。桁区切りは受け付けられません。
