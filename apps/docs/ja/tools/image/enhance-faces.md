---
description: "GFPGAN と CodeFormer のAIモデルで、画像内のぼやけた低品質な顔を復元・シャープ化します。"
i18n_source_hash: 7f9f6af8ebda
i18n_provenance: human
i18n_output_hash: ce5c9ffb5210
---

# 顔の高画質化 {#face-enhancement}

AIモデル（GFPGAN/CodeFormer）を使って画像内の顔を復元・強調します。

## API エンドポイント {#api-endpoint}

`POST /api/v1/tools/image/enhance-faces`

**処理:** 非同期（202を返し、SSE経由でステータスを取得するには `/api/v1/jobs/{jobId}/progress` をポーリング）

**モデルバンドル:** `upscale-enhance`（5〜6 GB）および `face-detection`（200〜300 MB）

## パラメータ {#parameters}

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|------|----------|---------|-------------|
| file | file | はい | - | 画像ファイル（multipart） |
| model | string | いいえ | `"auto"` | 使用するモデル: `auto`、`gfpgan`、`codeformer` |
| strength | number | いいえ | `0.8` | 強調の強さ（0〜1）。値が高いほど強い強調になります |
| onlyCenterFace | boolean | いいえ | `false` | 最も中央にある/目立つ顔のみを強調 |
| sensitivity | number | いいえ | `0.5` | 顔検出の感度（0〜1） |

## リクエスト例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/enhance-faces \
  -F "file=@portrait.jpg" \
  -F 'settings={"model":"codeformer","strength":0.7,"onlyCenterFace":false}'
```

## レスポンス {#response}

### 初回レスポンス（202 Accepted） {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### 進捗（`/api/v1/jobs/{jobId}/progress` でのSSE） {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Enhancing faces...","percent":60}
```

### 最終結果（SSE経由） {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/portrait_enhanced.png",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 350000,
    "processedSize": 600000,
    "facesDetected": 2,
    "faces": [
      {"x": 120, "y": 80, "w": 100, "h": 100},
      {"x": 350, "y": 90, "w": 95, "h": 95}
    ],
    "model": "codeformer"
  }
}
```

## 補足 {#notes}

- `upscale-enhance` モデルバンドル（5〜6 GB）と `face-detection` モデルバンドル（200〜300 MB）の両方が必要です。
- GFPGANはより積極的な強調を生成し、CodeFormerは本人らしさをより保持します。`auto` は入力に最適なモデルを選択します。
- 出力は最大品質のため常にPNG形式です。
- フロントエンドの表示を高速化するため、フル解像度の出力と併せてWebPプレビューが生成されます。
- `strength` パラメータは強調された顔を元の画像とブレンドします。控えめな改善には低い値（0.3〜0.5）を、より強い復元には高い値（0.7〜1.0）を使用します。
- HEIC/HEIF、RAW、TGA、PSD、EXR、HDR の入力形式に自動デコードで対応します。
