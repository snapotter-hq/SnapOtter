---
description: "画像を分析し、露出、コントラスト、ホワイトバランス、彩度、シャープネスを補正するワンクリック自動補正。"
i18n_source_hash: 42b6ab956f91
i18n_provenance: human
i18n_output_hash: 77f7a77601f0
---

# 画像エンハンスメント {#image-enhancement}

スマート分析によるワンクリック自動改善。画像を分析し、露出、コントラスト、ホワイトバランス、彩度、シャープネス、ノイズ除去の補正を適用します。

## API エンドポイント {#api-endpoint}

`POST /api/v1/tools/image/image-enhancement`

**処理:** 同期（`createToolRoute` ファクトリを使用し、結果を直接返します）

**モデルバンドル:** 基本的なエンハンスメントには不要です。`upscale-enhance` バンドル（5〜6 GB）は、`deepEnhance` が有効な場合（SCUNet による AI ノイズ除去用）にのみ使用されます。

## パラメーター {#parameters}

| パラメーター | 型 | 必須 | デフォルト | 説明 |
|-----------|------|----------|---------|-------------|
| file | file | はい | - | 画像ファイル（multipart） |
| mode | string | いいえ | `"auto"` | エンハンスメントモード: `auto`、`portrait`、`landscape`、`low-light`、`food`、`document` |
| intensity | number | いいえ | `50` | 全体的なエンハンスメントの強度（0〜100） |
| corrections | object | いいえ | すべて `true` | 適用する選択的補正（下記参照） |
| deepEnhance | boolean | いいえ | `false` | AI 駆動のノイズ除去を有効化（`noise-removal` ツールのインストールが必要） |

### Corrections オブジェクト {#corrections-object}

| フィールド | 型 | デフォルト | 説明 |
|-------|------|---------|-------------|
| exposure | boolean | `true` | 露出を自動補正 |
| contrast | boolean | `true` | コントラストを自動補正 |
| whiteBalance | boolean | `true` | ホワイトバランスを自動補正 |
| saturation | boolean | `true` | 彩度を自動補正 |
| sharpness | boolean | `true` | 自動シャープ化 |
| denoise | boolean | `true` | 軽度のノイズ除去 |

## リクエスト例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-enhancement \
  -F "file=@photo.jpg" \
  -F 'settings={"mode":"portrait","intensity":70,"corrections":{"exposure":true,"contrast":true,"sharpness":false}}'
```

## レスポンス（200 OK） {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/photo.jpg",
  "originalSize": 300000,
  "processedSize": 310000
}
```

## Analyze エンドポイント {#analyze-endpoint}

`POST /api/v1/tools/image/image-enhancement/analyze`

画像を分析し、適用せずに補正の推奨事項を返します。

### パラメーター {#parameters-1}

| パラメーター | 型 | 必須 | 説明 |
|-----------|------|----------|-------------|
| file | file | はい | 画像ファイル（multipart） |

### リクエスト例 {#example-request-1}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-enhancement/analyze \
  -F "file=@photo.jpg"
```

### レスポンス（200 OK） {#response-200-ok-1}

```json
{
  "corrections": {
    "exposure": { "value": 0.3, "direction": "brighten" },
    "contrast": { "value": 0.2, "direction": "increase" },
    "whiteBalance": { "value": 200, "direction": "warmer" },
    "saturation": { "value": 0.1, "direction": "increase" },
    "sharpness": { "value": 0.4, "direction": "sharpen" }
  }
}
```

## 注記 {#notes}

- このツールは同期の `createToolRoute` ファクトリを使用するため、標準のレスポンスを返します（202 非同期ではありません）。
- `mode` パラメーターは、補正の重み付けを調整します（例: ポートレートモードは肌のトーンに対してより穏やかに、ランドスケープモードは彩度を高めます）。
- `deepEnhance` が有効で、`noise-removal` ツール（SCUNet）がインストールされている場合、標準の補正後に追加の AI ノイズ除去パスが適用されます。
- analyze エンドポイントは、コミットする前にどの補正が適用されるかをプレビューするのに便利です。
- 自動デコードにより、HEIC/HEIF、RAW、TGA、PSD、EXR、HDR 入力形式に対応しています。
