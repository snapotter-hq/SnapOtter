---
description: "すべてのローカル ML ツールを網羅した AI エンジンリファレンス。背景除去、アップスケーリング、OCR、顔検出、写真復元など。"
i18n_output_hash: aabfa7bf38f2
i18n_source_hash: aa9a56cdddc7
i18n_provenance: human
---

# AI エンジンリファレンス {#ai-engine-reference}

`@snapotter/ai` パッケージは、ローカルの ML 操作のためにネイティブ ツールと Python ランタイムを調整します。 ほとんどの ML ツールは、高速ウォーム スタートのために永続的な Python sidecar を使用します。 OCR は意図的に分離されています。 `fast` はネイティブ Tesseract バイナリを呼び出します。 一方、`balanced` および `best` は、`/data/ai/v3` の下でアクティブで不変の RapidOCR 世代に固定された専用の永続 JSONL dispatcher を使用します。 各リクエストは generation lease を保持します。 アップグレード中、SnapOtter はアクティブ化する前に候補に対して smoke test を実行し、新しい dispatcher にアトミックに切り替えてから、garbage collection の前に古い世代を排出します。

NVIDIA CUDA は自動検出され、それをサポートするランタイムによって使用されます。 OCR はすべてのホストで CPU を使用します。 NVIDIA GPU を搭載したシステムを含む、 このツールの CUDA とドライバーの結合を回避します。

VA-API、Quick Sync、OpenCL を介した Intel/AMD の iGPU アクセラレーションは、現時点では AI 推論に対応していません。`/dev/dri` をコンテナにマッピングしても、CUDA 対応の NVIDIA GPU が利用できない限り、これらの Python サイドカーツールは高速化されません。

4 つのモダリティ（画像、音声、動画、ドキュメント）にわたる 19 個の Python サイドカー AI ツールに加え、AI 機能をオプションで備えた 2 個のツールがあります。すべてのモデルはローカルで動作します。初回のモデルダウンロード後はインターネットは不要です。


<!-- korean-ocr-contract:start -->
::: info 韓国語 OCR の互換性
高速 OCR は `auto`、`en`、`de`、`es`、`fr`、`zh`、`ja` に対応しますが、韓国語 (`ko`) には対応しません。韓国語には高精度 OCR パックと `balanced` または `best` が必要です。パックは公式 Linux amd64/arm64 コンテナで動作し、NVIDIA ホストでも OCR は CPU 上で実行されます。非対応システムでは明示的な互換性エラーを返し、暗黙に `fast` へ切り替えません。韓国語で `fast` または旧 `tesseract` エイリアスを指定すると、キュー投入前に `FEATURE_INCOMPATIBLE` と `fast-korean-unsupported` で拒否されます。
:::
<!-- korean-ocr-contract:end -->
## アーキテクチャ {#architecture}

```
Node.js Tool Route
      |
      v
 @snapotter/ai bridge.ts
      | (stdin/stdout JSON + stderr progress events)
      v
 +-- Native Tesseract + Ghostscript (fast image/PDF OCR)
 |
 +-- Isolated OCR runtime (persistent JSONL dispatcher)
 |     `-- RapidOCR + ONNX Runtime CPU + pinned PP-OCR models
 |
 `-- Python dispatcher (persistent process, "ai" profile)
      |
      |-- remove_bg.py        (rembg / BiRefNet)
      |-- upscale.py          (RealESRGAN)
      |-- inpaint.py          (LaMa ONNX)
      |-- outpaint.py         (LaMa canvas expansion)
      |-- detect_faces.py     (MediaPipe)
      |-- face_landmarks.py   (MediaPipe landmarks)
      |-- enhance_faces.py    (GFPGAN / CodeFormer)
      |-- colorize.py         (DDColor)
      |-- noise_removal.py    (SCUNet / tiered denoising)
      |-- red_eye_removal.py  (landmark + color analysis)
      |-- restore.py          (scratch repair + enhancement + denoising)
      |-- transcribe.py       (faster-whisper speech-to-text)
      +-- install_feature.py  (on-demand bundle installer)
```

別の「docs」ディスパッチャープロファイルは、AI 許可リストをドキュメント処理スクリプト（`doc_pagecount`、`doc_health`、`doc_flatten`、`doc_redact`、`doc_text`、`doc_to_word`、`doc_metadata`、`doc_html_pdf`）に置き換え、重い ML インポートをスキップします。

**タイムアウト:** デフォルトは 300 秒。OCR と BiRefNet 背景除去は 600 秒です。

## フィーチャーバンドル {#feature-bundles}

AI モデルは、ツールごとに 1 つのアーカイブとしてではなく、共有される依存関係スタックによってパッケージ化されています。フィーチャーバンドルは、同じモデルファミリー、Python ホイール、またはネイティブライブラリを使用するツールをまとめて有効化できます。これにより、リリース用の Docker イメージが小さく保たれ、同じ背景マッティング、顔検出、OCR、復元、音声モデルの重複コピーの保存を避けられます。

Docker イメージには、アプリケーションと共通ランタイムが同梱されています。大きなモデルアーカイブはオンデマンドで永続的な `/data/ai` ボリュームにダウンロードされ、それを必要とするすべてのツールで再利用されます。別のツールがすでに必要としたためにバンドルがインストール済みの場合、新たに依存するツールを有効化してもそのバンドルは再ダウンロードされません。

ほとんどの AI ツールは、実行する前に 1 つ以上の機能バンドルを必要とします。 管理 UI は、`POST /api/v1/admin/tools/:toolId/features/install` を介してツールによってこれらをインストールします。これにより、完全なバンドル リストが解決され、すでにインストールされているバンドルがスキップされ、不足しているダウンロードのみがキューに入れられます。 たとえば、新しいインスタンス キュー `background-removal` および `face-detection` でパスポート写真を有効にすると、 バックグラウンド削除がすでにインストールされている後に有効にすると、`face-detection` のみがキューに追加されます。 OCR は例外です。 `fast` パックは必要ありません。 UI または `POST /api/v1/admin/features/ocr/install` を通じて、オプションの正確なランタイムをインストールします。

| バンドル | サイズ | 共有依存関係グループ | 使用するツール |
|--------|------|-------------------------|-------------------|
| `background-removal` | 4-5 GB | rembg / BiRefNet 背景マッティング | remove-background, passport-photo, transparency-fixer, background-replace, blur-background |
| `face-detection` | 200-300 MB | MediaPipe 顔検出とランドマーク | blur-faces, red-eye-removal, smart-crop |
| `object-eraser-colorize` | 1-2 GB | LaMa インペインティング/アウトペインティングと DDColor | erase-object, colorize, ai-canvas-expand |
| `upscale-enhance` | 5-6 GB | RealESRGAN、GFPGAN / CodeFormer、ノイズ除去 | upscale, enhance-faces, noise-removal |
| `photo-restoration` | 4-5 GB | 傷の修復と復元パイプライン | restore-photo |
| `ocr` | ~208-234 MiB ダウンロード / ~409-488 MiB インストール済み | オプションの RapidOCR 3.9.1、ONNX Runtime 1.20.1、および固定された PP-OCR モデル | ocr、ocr-pdf (`balanced` および `best` のみ) |
| `transcription` | ~600 MB | faster-whisper 音声認識モデル | transcribe-audio, auto-subtitles |

複数バンドルにまたがる依存関係を持つツール:

| ツール | 必要なバンドル | 理由 |
|------|------------------|-----|
| `passport-photo` | `background-removal`, `face-detection` | 背景を除去した後、顔のランドマークを使って、パスポートや ID 写真の規則に合わせてクロップを構図します。 |
| `enhance-faces` | `upscale-enhance`, `face-detection` | 選択した顔の領域で GFPGAN または CodeFormer による補正を実行する前に、顔を検出します。 |

ツールは、OCR を除き、必要なバンドルがすべてインストールされている場合にのみ使用できます。その組み込みの `fast` 層は、オプションの OCR パックがなくても引き続き使用できます。 部分インストールは有効であり、段階的に処理されます。インストールされたバンドルは再利用され、不足しているバンドルはダウンロードとして表示され、キューに入れられたインストールは一度に 1 つずつ実行されるため、共有 Python 環境は同時に変更されません。

### 正確な OCR ランタイム インストール {#accurate-ocr-runtime-installation}

正確な OCR パックは、公式 Linux amd64 または Linux arm64 コンテナー用のプラットフォーム固有のランタイムです。 amd64 ビルドは Python 3.12 を使用します。 arm64 ビルドは Python 3.11 を使用します。 どちらのビルドも ONNX Runtime の `CPUExecutionProvider` を介して RapidOCR を実行するため、同じパックが CPU のみおよび NVIDIA Docker ホストで動作します。 正確なランタイムには、少なくとも 4 GiB の有効メモリ (構成されたコンテナーの cgroup 制限、それ以外の場合はホスト メモリ) が必要です。 署名された互換性の最小値を下回るシステムは、ダウンロード前に拒否されます。 この要件は、組み込みの Fast OCR には適用されません。 Bare-metal ビルドは、libc および Python ABI を安全に推論できないため拒否されます。 ホストが Tesseract および Ghostscript を提供する場合、高速 OCR は引き続き利用可能です。

オプションのアーティファクトは、アーキテクチャに応じて、圧縮すると約 208 ～ 234 MiB、抽出すると約 409 ～ 488 MiB になります。 署名付きインデックスは、インストーラーによって強制された正確な圧縮バイト数と抽出バイト数をバインドします。 組み込みの Tesseract は、約 25 の MiB を公式イメージに追加し、`/data/ai` 内のファイルは必要ありません。

オンライン インストールでは、署名付きリリース インデックスと、現在のプラットフォームの正確なコンテンツ アドレス指定されたアーティファクトが取得されます。 SnapOtter は、新しい世代をアトミックにアクティブ化する前に、Ed25519 インデックス署名、アーティファクト サイズ、SHA-256 ダイジェスト、モデル ダイジェスト、パス、ファイル モード、およびステージングされた smoke test を検証します。 インストールが失敗すると、以前の正常な世代がアクティブなままになります。

エアギャップ インストールの場合は、`index` および `archive` という名前のマルチパート フィールドを使用して、リリースの `ocr-runtime-index.json` と一致する OCR ランタイム アーカイブの両方を `POST /api/v1/admin/features/import` にアップロードします。 オフライン インポートでは、オンライン インストールと同じ署名、ハッシュ、抽出、互換性、およびスモーク テスト チェックが適用されます。 信頼された署名付きインデックスのないアーカイブは拒否されます。

---

## 背景除去 {#background-removal}

**ツールルート:** `remove-background`  
**モデル:** BiRefNet（デフォルト）または U2-Net バリアントを用いた rembg

| パラメータ | 型 | デフォルト | 説明 |
|-----------|------|---------|-------------|
| `model` | string | - | モデルバリアント（任意の上書き） |
| `backgroundType` | string | `"transparent"` | 次のいずれか: `transparent`, `color`, `gradient`, `blur`, `image` |
| `backgroundColor` | string | - | 単色背景の 16 進カラー |
| `gradientColor1` | string | - | グラデーションの 1 色目 |
| `gradientColor2` | string | - | グラデーションの 2 色目 |
| `gradientAngle` | number | - | グラデーションの角度（度） |
| `blurEnabled` | boolean | - | 背景ぼかし効果を有効化 |
| `blurIntensity` | number (0-100) | - | ぼかしの強度 |
| `shadowEnabled` | boolean | - | 被写体にドロップシャドウを有効化 |
| `shadowOpacity` | number (0-100) | - | シャドウの不透明度 |
| `outputFormat` | string | - | 出力形式: `png`, `webp`, または `avif` |
| `edgeRefine` | integer (0-3) | - | エッジ精細化レベル |
| `decontaminate` | boolean | - | エッジからの色にじみを除去 |

## 背景の置き換え {#background-replace}

**ツールルート:** `background-replace`  
**モデル:** rembg / BiRefNet（remove-background と共有）

背景を除去し、単色またはグラデーションに置き換えます。

| パラメータ | 型 | デフォルト | 説明 |
|-----------|------|---------|-------------|
| `backgroundType` | `"color"` \| `"gradient"` | `"color"` | 背景モード |
| `color` | string | `"#ffffff"` | 背景の 16 進カラー（`backgroundType` が `color` の場合） |
| `gradientColor1` | string | - | グラデーションの 1 色目（16 進） |
| `gradientColor2` | string | - | グラデーションの 2 色目（16 進） |
| `gradientAngle` | integer (0-360) | `180` | グラデーションの角度（度） |
| `feather` | integer (0-20) | `0` | エッジのぼかし半径 |
| `format` | `"png"` \| `"webp"` | `"png"` | 出力形式 |

## 背景をぼかす {#blur-background}

**ツールルート:** `blur-background`  
**モデル:** rembg / BiRefNet（remove-background と共有）

被写体をシャープに保ちながら背景をぼかします。

| パラメータ | 型 | デフォルト | 説明 |
|-----------|------|---------|-------------|
| `intensity` | integer (1-100) | `50` | ぼかしの強度 |
| `feather` | integer (0-20) | `0` | エッジのぼかし半径 |
| `format` | `"png"` \| `"webp"` | `"png"` | 出力形式 |

## 画像のアップスケーリング {#image-upscaling}

**ツールルート:** `upscale`  
**モデル:** RealESRGAN（利用できない場合は Lanczos にフォールバック）

| パラメータ | 型 | デフォルト | 説明 |
|-----------|------|---------|-------------|
| `scale` | number | `2` | アップスケール倍率 |
| `model` | string | `"auto"` | モデルバリアント |
| `faceEnhance` | boolean | `false` | GFPGAN による顔補正パスを適用 |
| `denoise` | number | `0` | ノイズ除去の強度 |
| `format` | string | `"auto"` | 出力形式の上書き |
| `quality` | number | `95` | 出力品質（1-100） |

## OCR / テキスト抽出 {#ocr-text-extraction}

**ツールルート:** `ocr`  
**モデル:** Tesseract (`fast`); RapidOCR と PP-OCRv6 小型モデル (`balanced`)。調整されたバリアント スコアリングを備えた PP-OCRv6 中モデル (`best`)

| パラメータ | 型 | デフォルト | 説明 |
|-----------|------|---------|-------------|
| `quality` | `"fast"` \| `"balanced"` \| `"best"` | 動的 | `quality` と `engine` を省略すると、SnapOtter は `best`、`balanced`、`fast` の順で利用可能な最上位の層を選びます。韓国語では `fast` を選択せず、`best`、次に `balanced` を使用し、どちらもなければ高精度ランタイムのインストールまたは互換性エラーを返します。 |
| `language` | string | `"auto"` | 言語: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| `enhance` | ブール値 | ティアに依存 | 局所的なコントラストを改善します。高速ではそれを直接適用します。正確な階層は、調整されたスコアによって OCR が向上した場合にのみバリアントを保持します。デフォルトで最良の状態 |
| `engine` | 弦 | - | 非推奨の互換性エイリアス。 `tesseract` を `fast` にマップし、従来の `paddleocr` 値を `balanced` にマップします。 PaddlePaddle はロードされません |

抽出されたテキストと来歴メタデータを返します: エンジン、要求された品質と実際の品質、デバイス、プロバイダー、劣化状態、警告、および該当する場合は正確なランタイム/モデルのバージョン。 明示的な品質要求が別の層にフォー​​ルバックすることはありません。 `balanced` または `best` が使用できない場合、API は、`fast` をサイレントに実行する代わりに、`FEATURE_NOT_INSTALLED` または `FEATURE_INCOMPATIBLE` を返します。

## PDF OCR {#pdf-ocr}

**ツールルート:** `ocr-pdf`  
**モデル:** 画像 OCR と同じティアシステム

AI ベースの OCR を使用して、スキャンされた PDF ドキュメントからページごとにテキストを抽出します。

| パラメータ | 型 | デフォルト | 説明 |
|-----------|------|---------|-------------|
| `quality` | `"fast"` \| `"balanced"` \| `"best"` | 動的 | `quality` と `engine` を省略すると、SnapOtter は `best`、`balanced`、`fast` の順で利用可能な最上位の層を選びます。韓国語では `fast` を選択せず、`best`、次に `balanced` を使用し、どちらもなければ高精度ランタイムのインストールまたは互換性エラーを返します。 |
| `language` | string | `"auto"` | 言語: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| `pages` | string | `"all"` | ページ選択: `"all"`, `"1-3"`, `"1,3,5"` |
| `enhance` | ブール値 | ティアに依存 | 局所的なコントラストを改善します。高速ではそれを直接適用します。正確な階層は、調整されたスコアによって OCR が向上した場合にのみバリアントを保持します。デフォルトで最良の状態 |
| `engine` | 弦 | - | 非推奨の互換性エイリアス。 `tesseract` を `fast` にマップし、従来の `paddleocr` 値を `balanced` にマップします。 PaddlePaddle はロードされません |

同じダウングレードなしルールが PDF OCR にも適用されます。 PDF ページは認識前にラスタライズされ、1 つのリクエストで最大 50 ページを選択できます。

## 顔 / 個人情報のぼかし {#face-pii-blur}

**ツールルート:** `blur-faces`  
**モデル:** MediaPipe 顔検出

| パラメータ | 型 | デフォルト | 説明 |
|-----------|------|---------|-------------|
| `blurRadius` | number (1-100) | `30` | ガウスぼかしの半径 |
| `sensitivity` | number (0-1) | `0.5` | 検出信頼度のしきい値 |

## 顔補正 {#face-enhancement}

**ツールルート:** `enhance-faces`  
**モデル:** GFPGAN, CodeFormer

| パラメータ | 型 | デフォルト | 説明 |
|-----------|------|---------|-------------|
| `model` | `"auto"` \| `"gfpgan"` \| `"codeformer"` | `"auto"` | 補正モデル |
| `strength` | number (0-1) | `0.8` | 補正の強度 |
| `sensitivity` | number (0-1) | `0.5` | 顔検出のしきい値 |
| `onlyCenterFace` | boolean | `false` | 最も中央にある顔のみを補正 |

## AI カラー化 {#ai-colorization}

**ツールルート:** `colorize`  
**モデル:** DDColor（OpenCV DNN にフォールバック）

白黒またはグレースケールの写真をフルカラーに変換します。

| パラメータ | 型 | デフォルト | 説明 |
|-----------|------|---------|-------------|
| `intensity` | number (0-1) | `1.0` | 色の彩度の強さ |
| `model` | `"auto"` \| `"ddcolor"` \| `"opencv"` | `"auto"` | モデルバリアント |

## ノイズ除去 {#noise-removal}

**ツールルート:** `noise-removal`  
**モデル:** SCUNet（ティア方式のノイズ除去パイプライン）

| パラメータ | 型 | デフォルト | 説明 |
|-----------|------|---------|-------------|
| `tier` | `"quick"` \| `"balanced"` \| `"quality"` \| `"maximum"` | `"balanced"` | 処理ティア |
| `strength` | number (0-100) | `50` | ノイズ除去の強度 |
| `detailPreservation` | number (0-100) | `50` | 保持するディテール量。高いほどテクスチャがより多く残ります |
| `colorNoise` | number (0-100) | `30` | カラーノイズ低減の強度 |
| `format` | string | `"original"` | 出力形式: `original`, `png`, `jpeg`, `webp`, `avif`, `jxl` |
| `quality` | number (1-100) | `90` | 出力エンコード品質 |

## 赤目除去 {#red-eye-removal}

**ツールルート:** `red-eye-removal`

顔のランドマークを検出し、目の領域を特定して、赤チャンネルの過飽和を補正します。

| パラメータ | 型 | デフォルト | 説明 |
|-----------|------|---------|-------------|
| `sensitivity` | number (0-100) | `50` | 赤ピクセル検出のしきい値 |
| `strength` | number (0-100) | `70` | 補正の強度 |
| `format` | string | - | 出力形式の上書き（任意） |
| `quality` | number (1-100) | `90` | 出力品質 |

## 写真復元 {#photo-restoration}

**ツールルート:** `restore-photo`

古い写真や損傷した写真のためのマルチステップパイプライン: 傷やちぎれの検出と修復、顔補正、ノイズ除去、任意のカラー化。

| パラメータ | 型 | デフォルト | 説明 |
|-----------|------|---------|-------------|
| `scratchRemoval` | boolean | `true` | 傷やちぎれを検出して修復 |
| `faceEnhancement` | boolean | `true` | 顔補正パスを適用 |
| `fidelity` | number (0-1) | `0.7` | 顔補正の強度（高いほど控えめ） |
| `denoise` | boolean | `true` | ノイズ除去パスを適用 |
| `denoiseStrength` | number (0-100) | `25` | ノイズ除去の強度 |
| `colorize` | boolean | `false` | 復元後にカラー化 |
| `colorizeStrength` | number (0-100) | `85` | カラー化の強度 |

## パスポート写真 {#passport-photo}

**ツールルート:** `passport-photo`  
**モデル:** MediaPipe 顔ランドマーク + BiRefNet 背景除去

2 フェーズのワークフロー: 分析（顔を検出 + 背景を除去）してから生成（クロップ、リサイズ、タイル配置）します。6 地域にわたる 37 か国以上に対応しています。

### フェーズ 1: 分析 {#phase-1-analyze}

`POST /api/v1/tools/image/passport-photo/analyze`

画像ファイル（マルチパート）を受け付けます。顔のランドマークデータ、base64 のプレビュー、画像の寸法を返します。

### フェーズ 2: 生成 {#phase-2-generate}

`POST /api/v1/tools/image/passport-photo/generate`

フェーズ 1 の結果に加えて生成設定を含む JSON ボディを受け付けます:

| パラメータ | 型 | デフォルト | 説明 |
|-----------|------|---------|-------------|
| `jobId` | string | （必須） | フェーズ 1 のジョブ ID |
| `filename` | string | （必須） | フェーズ 1 の元のファイル名 |
| `countryCode` | string | （必須） | ISO 国コード（例: `US`, `GB`, `IN`） |
| `documentType` | string | `"passport"` | ドキュメントの種類 |
| `bgColor` | string | `"#FFFFFF"` | 背景色の 16 進 |
| `printLayout` | string | `"none"` | 印刷レイアウト: `none`, `4x6`, `a4`, `letter` |
| `maxFileSizeKb` | number | `0` | 最大ファイルサイズ（KB、0 = 制限なし） |
| `dpi` | number (72-1200) | `300` | 出力 DPI |
| `customWidthMm` | number | - | カスタム幅（mm、国別仕様を上書き） |
| `customHeightMm` | number | - | カスタム高さ（mm、国別仕様を上書き） |
| `zoom` | number (0.5-3) | `1` | ズーム倍率 |
| `adjustX` | number | `0` | 水平方向の位置調整 |
| `adjustY` | number | `0` | 垂直方向の位置調整 |
| `landmarks` | object | （必須） | フェーズ 1 のランドマーク |
| `imageWidth` | number | （必須） | フェーズ 1 の画像幅 |
| `imageHeight` | number | （必須） | フェーズ 1 の画像高さ |

## オブジェクト消去（インペインティング） {#object-erasing-inpainting}

**ツールルート:** `erase-object`  
**モデル:** ONNX Runtime を介した LaMa

マスクは base64 ではなく、**2 つ目のファイルパート**（フィールド名 `mask`）として送信されます。マスク内の白いピクセルが消去する領域を示します。`format` と `quality` の設定はトップレベルのフォームフィールドとして送信されます。

| パラメータ | 型 | デフォルト | 説明 |
|-----------|------|---------|-------------|
| `file` | file | （必須） | ソース画像（マルチパート） |
| `mask` | file | （必須） | マスク画像（マルチパート、フィールド名 `mask`、白 = 消去） |
| `format` | string | `"auto"` | 出力形式: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| `quality` | integer (1-100) | `95` | 出力品質 |

NVIDIA GPU が利用可能な場合は CUDA で高速化されます。

## AI キャンバス拡張 {#ai-canvas-expand}

**ツールルート:** `ai-canvas-expand`  
**モデル:** LaMa ベースのアウトペインティング

画像のキャンバスを任意の方向に拡張し、新しい領域を既存の画像に合わせた AI 生成コンテンツで埋めます。

| パラメータ | 型 | デフォルト | 説明 |
|-----------|------|---------|-------------|
| `extendTop` | integer | `0` | 上方向に拡張するピクセル数 |
| `extendRight` | integer | `0` | 右方向に拡張するピクセル数 |
| `extendBottom` | integer | `0` | 下方向に拡張するピクセル数 |
| `extendLeft` | integer | `0` | 左方向に拡張するピクセル数 |
| `tier` | `"fast"` \| `"balanced"` \| `"high"` | `"balanced"` | 品質ティア |
| `format` | string | `"auto"` | 出力形式: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| `quality` | integer (1-100) | `95` | 出力品質 |

少なくとも 1 つの拡張方向が 0 より大きくなければなりません。

## スマートクロップ {#smart-crop}

**ツールルート:** `smart-crop`  
**モデル:** MediaPipe 顔検出（face モードのみ）

| パラメータ | 型 | デフォルト | 説明 |
|-----------|------|---------|-------------|
| `mode` | string | `"subject"` | クロップ戦略: `subject`, `face`, `trim` |
| `strategy` | `"attention"` \| `"entropy"` | `"attention"` | subject モードの戦略 |
| `width` | integer | - | 出力幅 |
| `height` | integer | - | 出力高さ |
| `padding` | integer (0-50) | `0` | 被写体周りのパディング割合 |
| `facePreset` | string | `"head-shoulders"` | `mode=face` の場合のプリセット構図 |
| `sensitivity` | number (0-1) | `0.5` | 顔検出のしきい値 |
| `threshold` | integer (0-255) | `30` | 背景検出のしきい値（trim モード） |
| `padToSquare` | boolean | `false` | トリミング結果を正方形にパディング |
| `padColor` | string | `"#ffffff"` | 正方形パディングの背景色 |
| `targetSize` | integer | - | パディング後の出力の目標サイズ（ピクセル） |
| `quality` | integer (1-100) | - | 出力品質 |

レガシーの `mode` 値 `attention` と `content` は受け付けられ、それぞれ `subject` と `trim` にマッピングされます。

**顔プリセット:**

| プリセット | 最適な用途 |
|--------|---------|
| `closeup` | ヘッドショット |
| `head-shoulders` | プロフィール写真 |
| `upper-body` | LinkedIn / フォーマル |
| `half-body` | 上半身全体 |

## 音声の文字起こし {#transcribe-audio}

**ツールルート:** `transcribe-audio`  
**モデル:** faster-whisper

音声をテキストに変換します。プレーンテキスト、SRT、VTT の出力形式に対応しています。

| パラメータ | 型 | デフォルト | 説明 |
|-----------|------|---------|-------------|
| `language` | string | `"auto"` | 言語: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| `outputFormat` | `"txt"` \| `"srt"` \| `"vtt"` | `"txt"` | 出力形式 |

## 自動字幕 {#auto-subtitles}

**ツールルート:** `auto-subtitles`  
**モデル:** faster-whisper（動画から音声を抽出してから文字起こし）

動画の音声トラックから字幕ファイルを生成します。

| パラメータ | 型 | デフォルト | 説明 |
|-----------|------|---------|-------------|
| `language` | string | `"auto"` | 言語: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| `format` | `"srt"` \| `"vtt"` | `"srt"` | 出力字幕形式 |

## PNG 透過修正 {#png-transparency-fixer}

**ツールルート:** `transparency-fixer`  
**モデル:** BiRefNet HR マッティング（2048x2048 解像度）

背景が除去されたものの、フリンジ、ハロー、半透明のアーティファクトが残った「見せかけの透過」PNG を修正します。BiRefNet の高解像度マッティングモデルを使用してクリーンなアルファチャンネルを生成し、その後、設定可能なデフリンジ処理を適用してエッジに沿った色の混入を除去します。

**OOM フォールバックチェーン:** BiRefNet HR マッティングが利用可能なメモリを超過した場合、ツールは自動的に `birefnet-general` にフォールバックし、さらに `u2net` にフォールバックします。

| パラメータ | 型 | デフォルト | 説明 |
|-----------|------|---------|-------------|
| `defringe` | number (0-100) | `30` | 色の混入を除去するエッジデフリンジの強度 |
| `outputFormat` | `"png"` \| `"webp"` | `"png"` | 出力画像形式 |
| `removeWatermark` | boolean | `false` | ウォーターマーク除去の前処理（メディアンフィルター）を適用 |

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/transparency-fixer \
  -H "Authorization: Bearer <token>" \
  -F "file=@fake-transparent.png" \
  -F 'settings={"defringe":30,"outputFormat":"png"}'
```

---

## AI 機能をオプションで備えたツール {#tools-with-optional-ai-capabilities}

以下のツールは Python サイドカーツールではありませんが、特定のオプションが有効な場合に AI 機能を使用します。

### 画像補正 {#image-enhancement}

**ツールルート:** `image-enhancement`  
**エンジン:** 解析ベース（Sharp のヒストグラムと統計）

画像を解析し、露出、コントラスト、ホワイトバランス、彩度、シャープネス、ノイズに対して自動補正を適用します。シーン別のモードに対応しています。

| パラメータ | 型 | デフォルト | 説明 |
|-----------|------|---------|-------------|
| `mode` | `"auto"` \| `"portrait"` \| `"landscape"` \| `"low-light"` \| `"food"` \| `"document"` | `"auto"` | 補正を調整するシーンモード |
| `intensity` | number (0-100) | `50` | 全体的な補正の強度 |
| `corrections.exposure` | boolean | `true` | 露出補正を適用 |
| `corrections.contrast` | boolean | `true` | コントラスト補正を適用 |
| `corrections.whiteBalance` | boolean | `true` | ホワイトバランス補正を適用 |
| `corrections.saturation` | boolean | `true` | 彩度補正を適用 |
| `corrections.sharpness` | boolean | `true` | シャープネス補正を適用 |
| `corrections.denoise` | boolean | `true` | ノイズ除去を適用 |
| `deepEnhance` | boolean | `false` | SCUNet による AI ノイズ除去を有効化（`upscale-enhance` バンドルが必要） |

適用せずに検出された補正内容を返す追加の解析エンドポイントが `POST /api/v1/tools/image/image-enhancement/analyze` で利用できます。

### コンテンツを考慮したリサイズ（シームカービング） {#content-aware-resize-seam-carving}

**ツールルート:** `content-aware-resize`  
**エンジン:** Go の `caire` バイナリ（Python ではないため GPU の恩恵なし）

低エネルギーのシームを除去することで画像をインテリジェントにリサイズし、重要なコンテンツを保持します。

| パラメータ | 型 | デフォルト | 説明 |
|-----------|------|---------|-------------|
| `width` | number | - | 目標幅 |
| `height` | number | - | 目標高さ |
| `protectFaces` | boolean | `false` | 検出された顔の領域を保護（`face-detection` バンドルが必要） |
| `blurRadius` | number (0-20) | `4` | エネルギー計算のための事前ぼかし |
| `sobelThreshold` | number (1-20) | `2` | エッジ感度のしきい値 |
| `square` | boolean | `false` | 正方形出力を強制 |
