---
description: "各種の色覚異常を持つ人に画像がどう見えるかをシミュレートします。"
i18n_source_hash: 0b537628ba79
i18n_provenance: human
i18n_output_hash: cfdee097b0de
---

# 色覚異常シミュレーション {#color-blindness-simulation}

色覚異常（CVD）をシミュレートして、さまざまな種類の色覚異常を持つ人に画像がどう見えるかをプレビューします。デザイン、チャート、UIのアクセシビリティテストに便利です。

## API エンドポイント {#api-endpoint}

`POST /api/v1/tools/image/color-blindness`

画像ファイルとJSONの `settings` フィールドを含むmultipartフォームデータを受け付けます。

## パラメータ {#parameters}

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|------|----------|---------|-------------|
| simulationType | string | いいえ | `"deuteranomaly"` | シミュレートする色覚異常の種類 |

### シミュレーションの種類 {#simulation-types}

| 値 | 状態 | 説明 |
|-------|-----------|-------------|
| `protanopia` | 赤色盲 | 赤錐体細胞の完全欠損 |
| `deuteranopia` | 緑色盲 | 緑錐体細胞の完全欠損 |
| `tritanopia` | 青色盲 | 青錐体細胞の完全欠損 |
| `protanomaly` | 赤色弱 | 赤錐体の感度低下 |
| `deuteranomaly` | 緑色弱 | 緑錐体の感度低下（最も一般的） |
| `tritanomaly` | 青色弱 | 青錐体の感度低下 |
| `achromatopsia` | 全色盲 | 色覚の完全欠損 |
| `blueConeMonochromacy` | 青錐体のみ | 青錐体のみ機能する |

## リクエスト例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/color-blindness \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@design.png" \
  -F 'settings={"simulationType": "deuteranopia"}'
```

## レスポンス例 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/design.png",
  "originalSize": 1850000,
  "processedSize": 1820000
}
```

## 補足 {#notes}

- 第二色弱（緑色弱）がデフォルトなのは、これが最も一般的な色覚異常であり、男性の約6%に影響するためです。
- このシミュレーションは、錐体光受容体の低下または欠損が知覚される色をどう変化させるかをモデル化した色変換行列を使用します。
- このツールは非破壊的で、プレビューのみを生成します。アクセシビリティのために元の画像を変更することはありません。
- 出力形式は入力形式に一致します。HEIC、RAW、PSD、SVG の入力は処理前に自動でデコードされます。
