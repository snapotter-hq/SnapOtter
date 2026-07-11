---
description: "任意のエフェクト（ぼかし、影、グラデーション、カスタム背景）を備えた AI 背景除去。"
i18n_source_hash: 326a91284529
i18n_provenance: human
i18n_output_hash: 7c5bacf509f7
---

# 背景除去 {#remove-background}

任意のエフェクト（ぼかし、影、グラデーション、カスタム背景）を備えた AI 背景除去。

## API エンドポイント {#api-endpoint}

`POST /api/v1/tools/image/remove-background`

**処理:** 非同期（202 を返し、SSE 経由で `/api/v1/jobs/{jobId}/progress` をポーリングしてステータスを取得）

**モデルバンドル:** `background-removal`（4～5 GB）

## パラメーター {#parameters}

| パラメーター | 型 | 必須 | デフォルト | 説明 |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | 画像ファイル（マルチパート） |
| model | string | No | - | 使用する AI モデルのバリアント |
| backgroundType | string | No | `"transparent"` | 次のいずれか: `transparent`, `color`, `gradient`, `blur`, `image` |
| backgroundColor | string | No | - | 単色背景の 16 進カラー |
| gradientColor1 | string | No | - | グラデーションの 1 色目 |
| gradientColor2 | string | No | - | グラデーションの 2 色目 |
| gradientAngle | number | No | - | グラデーションの角度（度） |
| blurEnabled | boolean | No | - | 背景ぼかし効果を有効にする |
| blurIntensity | number | No | - | ぼかしの強度（0～100） |
| shadowEnabled | boolean | No | - | 被写体にドロップシャドウを有効にする |
| shadowOpacity | number | No | - | 影の不透明度（0～100） |
| outputFormat | string | No | - | 出力フォーマット: `png`, `webp`, または `avif` |
| edgeRefine | integer | No | - | エッジの精細化レベル（0～3） |
| decontaminate | boolean | No | - | エッジの色にじみを除去する |

## リクエスト例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/remove-background \
  -F "file=@photo.jpg" \
  -F 'settings={"backgroundType":"transparent","edgeRefine":2,"outputFormat":"png"}'
```

## レスポンス {#response}

### 初期レスポンス（202 Accepted） {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### 進捗（`/api/v1/jobs/{jobId}/progress` の SSE） {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Removing background...","percent":50}
```

### 最終結果（SSE 経由） {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_mask.png",
    "maskUrl": "/api/v1/download/{jobId}/photo_mask.png",
    "originalUrl": "/api/v1/download/{jobId}/photo_original.png",
    "originalSize": 245000,
    "processedSize": 180000,
    "filename": "photo.jpg",
    "model": "rembg"
  }
}
```

## エフェクトエンドポイント（フェーズ 2） {#effects-endpoint-phase-2}

`POST /api/v1/tools/image/remove-background/effects`

AI モデルを再実行せずに背景エフェクトを再適用します。フェーズ 1 のキャッシュされたマスクと元画像を使用します。

### パラメーター {#parameters-1}

| パラメーター | 型 | 必須 | デフォルト | 説明 |
|-----------|------|----------|---------|-------------|
| settings | JSON | Yes | - | エフェクト設定を含む JSON（下記参照） |
| backgroundImage | file | No | - | カスタム背景画像（backgroundType が `image` の場合） |

#### settings JSON のフィールド {#settings-json-fields}

| フィールド | 型 | 必須 | 説明 |
|-------|------|----------|-------------|
| jobId | string | Yes | フェーズ 1 のジョブ ID |
| filename | string | Yes | フェーズ 1 の元のファイル名 |
| backgroundType | string | No | `transparent`, `color`, `gradient`, `blur`, `image` |
| backgroundColor | string | No | 単色背景の 16 進カラー |
| gradientColor1 | string | No | グラデーションの 1 色目 |
| gradientColor2 | string | No | グラデーションの 2 色目 |
| gradientAngle | number | No | グラデーションの角度（度） |
| blurEnabled | boolean | No | 背景ぼかしを有効にする |
| blurIntensity | number | No | ぼかしの強度（0～100） |
| shadowEnabled | boolean | No | ドロップシャドウを有効にする |
| shadowOpacity | number | No | 影の不透明度（0～100） |
| outputFormat | string | No | `png`, `webp`, または `avif` |

### リクエスト例 {#example-request-1}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/remove-background/effects \
  -F 'settings={"jobId":"a1b2c3d4-...","filename":"photo.jpg","backgroundType":"color","backgroundColor":"#FF5500","outputFormat":"png"}'
```

### レスポンス（200 OK） {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/photo_nobg.png",
  "processedSize": 195000
}
```

## 注意事項 {#notes}

- `background-removal` モデルバンドル（4～5 GB）のインストールが必要です。
- フェーズ 1 は透明マスクと元画像をキャッシュするため、フェーズ 2（エフェクト）では AI モデルを再実行せずに、異なる背景を即座に再適用できます。
- HEIC/HEIF、RAW、TGA、PSD、EXR、HDR の入力フォーマットを自動デコードでサポートします。
- 処理前に EXIF の回転が自動補正されます。
