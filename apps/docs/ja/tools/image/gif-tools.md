---
description: "アニメーション GIF のリサイズ、最適化、速度変更、逆再生、回転、フレーム抽出を 1 つのツールで行います。"
i18n_source_hash: 5e525e80db92
i18n_provenance: human
i18n_output_hash: 2f1d49287380
---

# GIF ツール {#gif-tools}

アニメーション GIF のリサイズ、最適化、速度変更、逆再生、フレーム抽出、回転を行います。1 つのツールで複数の操作モードを提供します。

## API エンドポイント {#api-endpoint}

`POST /api/v1/tools/image/gif-tools`

## パラメーター {#parameters}

### 共通パラメーター {#common-parameters}

| パラメーター | 型 | 必須 | デフォルト | 説明 |
|-----------|------|----------|---------|-------------|
| mode | string | いいえ | `"resize"` | 操作モード: `resize`、`optimize`、`speed`、`reverse`、`extract`、`rotate` |
| loop | number | いいえ | 0 | 出力 GIF のループ回数（0 = 無限、1〜100 = 有限ループ） |

### リサイズモードのパラメーター {#resize-mode-parameters}

| パラメーター | 型 | 必須 | デフォルト | 説明 |
|-----------|------|----------|---------|-------------|
| width | integer | いいえ | - | 目標の幅（ピクセル、1 から 16384） |
| height | integer | いいえ | - | 目標の高さ（ピクセル、1 から 16384） |
| percentage | number | いいえ | - | パーセンテージでスケール（1 から 500）。設定すると width/height を上書きします。 |

### 最適化モードのパラメーター {#optimize-mode-parameters}

| パラメーター | 型 | 必須 | デフォルト | 説明 |
|-----------|------|----------|---------|-------------|
| colors | number | いいえ | 256 | パレット内の最大色数（2 から 256） |
| dither | number | いいえ | 1.0 | ディザリングの強度（0 から 1、0 でディザリングを無効化） |
| effort | number | いいえ | 7 | 最適化の労力レベル（1 から 10、高いほど遅いが小さくなる） |

### 速度モードのパラメーター {#speed-mode-parameters}

| パラメーター | 型 | 必須 | デフォルト | 説明 |
|-----------|------|----------|---------|-------------|
| speedFactor | number | いいえ | 1.0 | 速度倍率（0.1 から 10）。1 より大きい値で高速化、1 未満で低速化します。 |

### 抽出モードのパラメーター {#extract-mode-parameters}

| パラメーター | 型 | 必須 | デフォルト | 説明 |
|-----------|------|----------|---------|-------------|
| extractMode | string | いいえ | `"single"` | 抽出モード: `single`、`range`、`all` |
| frameNumber | number | いいえ | 0 | `single` モードで抽出するフレームのインデックス（0 始まり） |
| frameStart | number | いいえ | 0 | `range` モードの開始フレームインデックス（0 始まり） |
| frameEnd | number | いいえ | - | `range` モードの終了フレームインデックス（0 始まり、含む） |
| extractFormat | string | いいえ | `"png"` | 抽出フレームの形式: `png`、`webp` |

### 回転モードのパラメーター {#rotate-mode-parameters}

| パラメーター | 型 | 必須 | デフォルト | 説明 |
|-----------|------|----------|---------|-------------|
| angle | number | いいえ | - | 回転角度: `90`、`180`、または `270` 度 |
| flipH | boolean | いいえ | `false` | 水平方向に反転 |
| flipV | boolean | いいえ | `false` | 垂直方向に反転 |

## リクエスト例 {#example-requests}

### リサイズ {#resize}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@animation.gif" \
  -F 'settings={"mode":"resize","percentage":50}'
```

### 最適化 {#optimize}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@large.gif" \
  -F 'settings={"mode":"optimize","colors":128,"effort":9}'
```

### 高速化 {#speed-up}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@animation.gif" \
  -F 'settings={"mode":"speed","speedFactor":2.0}'
```

### 単一フレームの抽出 {#extract-single-frame}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@animation.gif" \
  -F 'settings={"mode":"extract","extractMode":"single","frameNumber":5,"extractFormat":"png"}'
```

## レスポンス例 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/animation.gif",
  "originalSize": 2345678,
  "processedSize": 1234567
}
```

## Info サブルート {#info-sub-route}

`POST /api/v1/tools/image/gif-tools/info`

アニメーション GIF を処理せずにそのメタデータを返します。

### Info リクエスト {#info-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools/info \
  -F "file=@animation.gif"
```

### Info レスポンス {#info-response}

```json
{
  "width": 480,
  "height": 320,
  "pages": 24,
  "delay": [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100],
  "loop": 0,
  "fileSize": 2345678,
  "duration": 2400
}
```

## 注記 {#notes}

- メイン処理エンドポイントには標準の `createToolRoute` ファクトリを使用します。
- info エンドポイントはファイルのアップロードのみを必要とします（設定は不要）。
- `resize` モードでは、`percentage` が指定されている場合、`width`/`height` より優先されます。リサイズはアスペクト比を維持するために `fit: inside` を使用します。
- `speed` モードでは、フレームの遅延が速度係数で除算されます。フレームあたりの最小遅延は 20ms です（GIF 仕様の制限）。
- `reverse` モードでは、逆再生しながら同時に速度を調整するために `speedFactor` パラメーターも使用できます。
- `range` または `all` を指定した `extract` モードでは、出力は個々のフレームを含む ZIP ファイルになります。
- `rotate` モードでは、各フレームが個別に処理され、アニメーションに再構成されます。
- `loop` パラメーターは、出力 GIF がループする回数を制御します。無限ループには 0 を使用します。
- info レスポンスの `duration` フィールドは、アニメーション全体の再生時間（ミリ秒）です。
