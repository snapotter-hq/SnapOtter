---
description: "カスタムカラーと誤り訂正レベルを指定して QR コードを生成します。"
i18n_source_hash: 096ef4d90da5
i18n_provenance: human
i18n_output_hash: e827c186510a
---

# QR コードジェネレーター {#qr-code-generator}

テキストや URL から QR コード画像を生成します。サイズ、誤り訂正レベル、前景色／背景色のカスタマイズが可能です。

## API エンドポイント {#api-endpoint}

`POST /api/v1/tools/image/qr-generate`

**JSON ボディ**（マルチパートではない）を受け付けます。ファイルアップロードは不要です。

## パラメーター {#parameters}

| パラメーター | 型 | 必須 | デフォルト | 説明 |
|-----------|------|----------|---------|-------------|
| text | string | Yes | - | QR コードにエンコードする内容（1～2000 文字） |
| size | number | No | `400` | 出力画像の幅／高さ（ピクセル、100～10000） |
| errorCorrection | string | No | `"M"` | 誤り訂正レベル: `L`（7%）, `M`（15%）, `Q`（25%）, `H`（30%） |
| foreground | string | No | `"#000000"` | QR コードの前景／モジュール色（16 進、`#RRGGBB`） |
| background | string | No | `"#FFFFFF"` | QR コードの背景色（16 進、`#RRGGBB`） |
| logoDataUri | string | No | - | データ URI としてのロゴ画像（`data:image/png;base64,...` または `data:image/jpeg;base64,...`、最大 700 KB）。QR コードの中央に QR サイズの 22% で配置されます。誤り訂正を `H` に強制します |

### 誤り訂正レベル {#error-correction-levels}

| レベル | 復元率 | ユースケース |
|-------|----------|----------|
| `L` | 約 7% | 最大のデータ密度 |
| `M` | 約 15% | バランス型（デフォルト） |
| `Q` | 約 25% | 印刷コードに適する |
| `H` | 約 30% | ロゴを重ねたコードに最適 |

## リクエスト例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/qr-generate \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "https://snapotter.com", "size": 500, "errorCorrection": "H"}'
```

カスタムカラーのブランド QR コード:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/qr-generate \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello World", "size": 300, "foreground": "#1a365d", "background": "#f7fafc"}'
```

## レスポンス例 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/qrcode.png",
  "originalSize": 0,
  "processedSize": 4520
}
```

## 注意事項 {#notes}

- このエンドポイントは、画像アップロードが不要なため、マルチパートフォームデータではなく JSON を受け付けます。
- 出力は常に PNG 画像です。
- 出力ファイル名は常に `qrcode.png` です。
- このツールは画像を新規生成するため、`originalSize` は常に 0 です。
- QR コードの周囲には 2 モジュールのクワイエットゾーン（余白）が含まれます。
- テキストの最大長は 2000 文字です。実際の容量は誤り訂正レベルと文字エンコードによって異なります。
- 誤り訂正レベルを高くすると、QR コードが部分的に隠れてもスキャン可能なままになりますが、データ容量は減少します。
- `logoDataUri` が指定された場合、ロゴが中央を覆っても QR コードがスキャン可能なままになるよう、誤り訂正が自動的に `H`（30%）に強制されます。
