---
description: すべてのローカル ML ツールを網羅した AI エンジンリファレンス。背景除去、アップスケーリング、OCR、顔検出、写真復元など。
i18n_source_hash: dd135f2e9fdb
i18n_provenance: human
i18n_output_hash: 94b694e32110
---

# AI エンジンリファレンス {#ai-engine-reference}

`@snapotter/ai` パッケージは、すべての ML 処理のために Node.js と**永続的な Python サイドカー**を橋渡しします。ディスパッチャープロセスはリクエスト間も稼働し続けるため、ウォームスタートで高速に動作します。NVIDIA CUDA は起動時に自動検出され、利用可能な場合に使用されます。利用できない場合、AI ツールは CPU 上で実行されます。

VA-API、Quick Sync、または OpenCL を介した Intel/AMD iGPU アクセラレーションは、現時点では AI 推論には対応していません。`/dev/dri` をコンテナにマッピングしても、CUDA 対応の NVIDIA GPU が利用可能でない限り、これらの Python サイドカーツールは高速化されません。

4 つのモダリティ(画像、音声、動画、ドキュメント)にわたる 19 個の Python サイドカー AI ツールに加え、オプションの AI 機能を備えた 2 個のツールがあります。すべてのモデルはローカルで実行され、初回のモデルダウンロード後はインターネット接続を必要としません。

## アーキテクチャ {#architecture}

```
Node.js Tool Route
      |
      v
 @snapotter/ai bridge.ts
      | (stdin/stdout JSON + stderr progress events)
      v
 Python dispatcher (persistent process, "ai" profile)
      |
      |-- remove_bg.py        (rembg / BiRefNet)
      |-- upscale.py          (RealESRGAN)
      |-- inpaint.py          (LaMa ONNX)
      |-- outpaint.py         (LaMa canvas expansion)
      |-- ocr.py              (PaddleOCR / Tesseract)
      |-- ocr_pdf.py          (page-by-page document OCR)
      |-- ocr_preprocess.py   (image enhancement for OCR)
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

別の「docs」ディスパッチャープロファイルは、AI 許可リストをドキュメント処理スクリプト(`doc_pagecount`、`doc_health`、`doc_flatten`、`doc_redact`、`doc_text`、`doc_to_word`、`doc_metadata`、`doc_html_pdf`)に置き換え、重い ML のインポートをスキップします。

**タイムアウト:** デフォルトは 300 秒。OCR と BiRefNet の背景除去は 600 秒です。

## 機能バンドル {#feature-bundles}

各 AI ツールを使用する前に、モデルバンドルをインストールする必要があります。バンドルは管理 UI または `install_feature.py` を介してオンデマンドでインストールされます。

| バンドル | サイズ | ツール |
|--------|------|-------|
| `background-removal` | 4-5 GB | remove-background, passport-photo, transparency-fixer, background-replace, blur-background |
| `face-detection` | 200-300 MB | blur-faces, red-eye-removal, smart-crop |
| `object-eraser-colorize` | 1-2 GB | erase-object, colorize, ai-canvas-expand |
| `upscale-enhance` | 5-6 GB | upscale, enhance-faces, noise-removal |
| `photo-restoration` | 4-5 GB | restore-photo |
| `ocr` | 5-6 GB | ocr, ocr-pdf |
| `transcription` | 約 600 MB | transcribe-audio, auto-subtitles |

---

## 背景除去 {#background-removal}

**ツールルート:** `remove-background`  
**モデル:** BiRefNet(デフォルト)または U2-Net バリアントを使用した rembg

| パラメータ | 型 | デフォルト | 説明 |
|-----------|------|---------|-------------|
| `model` | string | - | モデルバリアント(オプションの上書き) |
| `backgroundType` | string | `"transparent"` | 次のいずれか: `transparent`、`color`、`gradient`、`blur`、`image` |
| `backgroundColor` | string | - | 単色背景用の 16 進カラー |
| `gradientColor1` | string | - | グラデーションの 1 色目 |
| `gradientColor2` | string | - | グラデーションの 2 色目 |
| `gradientAngle` | number | - | グラデーションの角度(度) |
| `blurEnabled` | boolean | - | 背景ぼかし効果を有効にする |
| `blurIntensity` | number (0-100) | - | ぼかしの強度 |
| `shadowEnabled` | boolean | - | 被写体にドロップシャドウを有効にする |
| `shadowOpacity` | number (0-100) | - | 影の不透明度 |
| `outputFormat` | string | - | 出力形式: `png`、`webp`、または `avif` |
| `edgeRefine` | integer (0-3) | - | エッジ調整レベル |
| `decontaminate` | boolean | - | エッジのカラーのにじみを除去する |

## 背景の置き換え {#background-replace}

**ツールルート:** `background-replace`  
**モデル:** rembg / BiRefNet(remove-background と共有)

背景を除去し、単色またはグラデーションに置き換えます。

| パラメータ | 型 | デフォルト | 説明 |
|-----------|------|---------|-------------|
| `backgroundType` | `"color"` \| `"gradient"` | `"color"` | 背景モード |
| `color` | string | `"#ffffff"` | 背景の 16 進カラー(`backgroundType` が `color` の場合) |
| `gradientColor1` | string | - | グラデーションの 1 色目の 16 進カラー |
| `gradientColor2` | string | - | グラデーションの 2 色目の 16 進カラー |
| `gradientAngle` | integer (0-360) | `180` | グラデーションの角度(度) |
| `feather` | integer (0-20) | `0` | エッジのぼかし半径 |
| `format` | `"png"` \| `"webp"` | `"png"` | 出力形式 |

## 背景のぼかし {#blur-background}

**ツールルート:** `blur-background`  
**モデル:** rembg / BiRefNet(remove-background と共有)

被写体をシャープに保ちながら背景をぼかします。

| パラメータ | 型 | デフォルト | 説明 |
|-----------|------|---------|-------------|
| `intensity` | integer (1-100) | `50` | ぼかしの強度 |
| `feather` | integer (0-20) | `0` | エッジのぼかし半径 |
| `format` | `"png"` \| `"webp"` | `"png"` | 出力形式 |

## 画像のアップスケーリング {#image-upscaling}

**ツールルート:** `upscale`  
**モデル:** RealESRGAN(利用できない場合は Lanczos フォールバック)

| パラメータ | 型 | デフォルト | 説明 |
|-----------|------|---------|-------------|
| `scale` | number | `2` | アップスケール倍率 |
| `model` | string | `"auto"` | モデルバリアント |
| `faceEnhance` | boolean | `false` | GFPGAN 顔補正パスを適用する |
| `denoise` | number | `0` | ノイズ除去の強度 |
| `format` | string | `"auto"` | 出力形式の上書き |
| `quality` | number | `95` | 出力品質(1-100) |

## OCR / テキスト抽出 {#ocr-text-extraction}

**ツールルート:** `ocr`  
**モデル:** Tesseract(高速)、PaddleOCR PP-OCRv5(バランス型)、PaddleOCR-VL 1.5(最高品質)

| パラメータ | 型 | デフォルト | 説明 |
|-----------|------|---------|-------------|
| `quality` | `"fast"` \| `"balanced"` \| `"best"` | `"balanced"` | 処理ティア |
| `language` | string | `"auto"` | 言語: `auto`、`en`、`de`、`fr`、`es`、`zh`、`ja`、`ko` |
| `enhance` | boolean | `true` | OCR 精度を向上させるために画像を前処理する |
| `engine` | string | - | 非推奨。`tesseract` を `fast` に、`paddleocr` を `balanced` にマッピングします |

バウンディングボックス、信頼度スコア、抽出されたテキストブロックを含む構造化された結果を返します。

## PDF OCR {#pdf-ocr}

**ツールルート:** `ocr-pdf`  
**モデル:** 画像 OCR と同じティアシステム

AI ベースの OCR を使用して、スキャンされた PDF ドキュメントからページごとにテキストを抽出します。

| パラメータ | 型 | デフォルト | 説明 |
|-----------|------|---------|-------------|
| `quality` | `"fast"` \| `"balanced"` \| `"best"` | `"balanced"` | 処理ティア |
| `language` | string | `"auto"` | 言語: `auto`、`en`、`de`、`fr`、`es`、`zh`、`ja`、`ko` |
| `pages` | string | `"all"` | ページ選択: `"all"`、`"1-3"`、`"1,3,5"` |

## 顔 / PII のぼかし {#face-pii-blur}

**ツールルート:** `blur-faces`  
**モデル:** MediaPipe 顔検出

| パラメータ | 型 | デフォルト | 説明 |
|-----------|------|---------|-------------|
| `blurRadius` | number (1-100) | `30` | ガウスぼかしの半径 |
| `sensitivity` | number (0-1) | `0.5` | 検出の信頼度しきい値 |

## 顔の補正 {#face-enhancement}

**ツールルート:** `enhance-faces`  
**モデル:** GFPGAN、CodeFormer

| パラメータ | 型 | デフォルト | 説明 |
|-----------|------|---------|-------------|
| `model` | `"auto"` \| `"gfpgan"` \| `"codeformer"` | `"auto"` | 補正モデル |
| `strength` | number (0-1) | `0.8` | 補正の強度 |
| `sensitivity` | number (0-1) | `0.5` | 顔検出のしきい値 |
| `onlyCenterFace` | boolean | `false` | 最も中央にある顔のみを補正する |

## AI カラー化 {#ai-colorization}

**ツールルート:** `colorize`  
**モデル:** DDColor(OpenCV DNN フォールバック付き)

白黒またはグレースケールの写真をフルカラーに変換します。

| パラメータ | 型 | デフォルト | 説明 |
|-----------|------|---------|-------------|
| `intensity` | number (0-1) | `1.0` | 色の彩度の強さ |
| `model` | `"auto"` \| `"ddcolor"` \| `"opencv"` | `"auto"` | モデルバリアント |

## ノイズ除去 {#noise-removal}

**ツールルート:** `noise-removal`  
**モデル:** SCUNet(段階的ノイズ除去パイプライン)

| パラメータ | 型 | デフォルト | 説明 |
|-----------|------|---------|-------------|
| `tier` | `"quick"` \| `"balanced"` \| `"quality"` \| `"maximum"` | `"balanced"` | 処理ティア |
| `strength` | number (0-100) | `50` | ノイズ除去の強度 |
| `detailPreservation` | number (0-100) | `50` | 保持するディテールの量。高いほどテクスチャを多く残します |
| `colorNoise` | number (0-100) | `30` | 色ノイズ低減の強度 |
| `format` | string | `"original"` | 出力形式: `original`、`png`、`jpeg`、`webp`、`avif`、`jxl` |
| `quality` | number (1-100) | `90` | 出力エンコード品質 |

## 赤目除去 {#red-eye-removal}

**ツールルート:** `red-eye-removal`

顔のランドマークを検出し、目の領域を特定して、赤チャンネルの過飽和を補正します。

| パラメータ | 型 | デフォルト | 説明 |
|-----------|------|---------|-------------|
| `sensitivity` | number (0-100) | `50` | 赤ピクセル検出のしきい値 |
| `strength` | number (0-100) | `70` | 補正の強度 |
| `format` | string | - | 出力形式の上書き(オプション) |
| `quality` | number (1-100) | `90` | 出力品質 |

## 写真の復元 {#photo-restoration}

**ツールルート:** `restore-photo`

古い写真や損傷した写真のための複数ステップのパイプライン: 傷や破れの検出と修復、顔の補正、ノイズ除去、およびオプションのカラー化。

| パラメータ | 型 | デフォルト | 説明 |
|-----------|------|---------|-------------|
| `scratchRemoval` | boolean | `true` | 傷や破れを検出して修復する |
| `faceEnhancement` | boolean | `true` | 顔の補正パスを適用する |
| `fidelity` | number (0-1) | `0.7` | 顔補正の強度(高いほど控えめ) |
| `denoise` | boolean | `true` | ノイズ除去パスを適用する |
| `denoiseStrength` | number (0-100) | `25` | ノイズ除去の強度 |
| `colorize` | boolean | `false` | 復元後にカラー化する |
| `colorizeStrength` | number (0-100) | `85` | カラー化の強度 |

## パスポート写真 {#passport-photo}

**ツールルート:** `passport-photo`  
**モデル:** MediaPipe 顔ランドマーク + BiRefNet 背景除去

2 段階のワークフロー: 解析(顔検出 + 背景除去)、その後生成(切り抜き、リサイズ、タイル配置)。6 つの地域にまたがる 37 以上の国に対応しています。

### フェーズ 1: 解析 {#phase-1-analyze}

`POST /api/v1/tools/image/passport-photo/analyze`

画像ファイル(multipart)を受け付けます。顔のランドマークデータ、base64 プレビュー、および画像の寸法を返します。

### フェーズ 2: 生成 {#phase-2-generate}

`POST /api/v1/tools/image/passport-photo/generate`

フェーズ 1 の結果に生成設定を加えた JSON ボディを受け付けます:

| パラメータ | 型 | デフォルト | 説明 |
|-----------|------|---------|-------------|
| `jobId` | string | (必須) | フェーズ 1 のジョブ ID |
| `filename` | string | (必須) | フェーズ 1 の元のファイル名 |
| `countryCode` | string | (必須) | ISO 国コード(例: `US`、`GB`、`IN`) |
| `documentType` | string | `"passport"` | ドキュメントの種類 |
| `bgColor` | string | `"#FFFFFF"` | 背景色の 16 進カラー |
| `printLayout` | string | `"none"` | 印刷レイアウト: `none`、`4x6`、`a4`、`letter` |
| `maxFileSizeKb` | number | `0` | 最大ファイルサイズ(KB 単位、0 = 無制限) |
| `dpi` | number (72-1200) | `300` | 出力 DPI |
| `customWidthMm` | number | - | カスタム幅(mm 単位、国別仕様を上書き) |
| `customHeightMm` | number | - | カスタム高さ(mm 単位、国別仕様を上書き) |
| `zoom` | number (0.5-3) | `1` | ズーム倍率 |
| `adjustX` | number | `0` | 水平位置の調整 |
| `adjustY` | number | `0` | 垂直位置の調整 |
| `landmarks` | object | (必須) | フェーズ 1 のランドマーク |
| `imageWidth` | number | (必須) | フェーズ 1 の画像幅 |
| `imageHeight` | number | (必須) | フェーズ 1 の画像高さ |

## オブジェクトの消去(インペインティング) {#object-erasing-inpainting}

**ツールルート:** `erase-object`  
**モデル:** ONNX Runtime 経由の LaMa

マスクは base64 ではなく、**2 つ目のファイルパート**(フィールド名 `mask`)として送信されます。マスク内の白いピクセルが消去する領域を示します。`format` と `quality` の設定は、トップレベルのフォームフィールドとして送信されます。

| パラメータ | 型 | デフォルト | 説明 |
|-----------|------|---------|-------------|
| `file` | file | (必須) | ソース画像(multipart) |
| `mask` | file | (必須) | マスク画像(multipart、フィールド名 `mask`、白 = 消去) |
| `format` | string | `"auto"` | 出力形式: `auto`、`png`、`jpg`、`jpeg`、`webp`、`tiff`、`gif`、`avif`、`heic`、`heif`、`jxl` |
| `quality` | integer (1-100) | `95` | 出力品質 |

NVIDIA GPU が利用可能な場合は CUDA で高速化されます。

## AI キャンバス拡張 {#ai-canvas-expand}

**ツールルート:** `ai-canvas-expand`  
**モデル:** LaMa ベースのアウトペインティング

画像のキャンバスを任意の方向に拡張し、既存の画像に合致する AI 生成コンテンツで新しい領域を埋めます。

| パラメータ | 型 | デフォルト | 説明 |
|-----------|------|---------|-------------|
| `extendTop` | integer | `0` | 上方向に拡張するピクセル数 |
| `extendRight` | integer | `0` | 右方向に拡張するピクセル数 |
| `extendBottom` | integer | `0` | 下方向に拡張するピクセル数 |
| `extendLeft` | integer | `0` | 左方向に拡張するピクセル数 |
| `tier` | `"fast"` \| `"balanced"` \| `"high"` | `"balanced"` | 品質ティア |
| `format` | string | `"auto"` | 出力形式: `auto`、`png`、`jpg`、`jpeg`、`webp`、`tiff`、`gif`、`avif`、`heic`、`heif`、`jxl` |
| `quality` | integer (1-100) | `95` | 出力品質 |

少なくとも 1 つの拡張方向が 0 より大きい必要があります。

## スマートクロップ {#smart-crop}

**ツールルート:** `smart-crop`  
**モデル:** MediaPipe 顔検出(顔モードのみ)

| パラメータ | 型 | デフォルト | 説明 |
|-----------|------|---------|-------------|
| `mode` | string | `"subject"` | クロップ戦略: `subject`、`face`、`trim` |
| `strategy` | `"attention"` \| `"entropy"` | `"attention"` | 被写体モードの戦略 |
| `width` | integer | - | 出力幅 |
| `height` | integer | - | 出力高さ |
| `padding` | integer (0-50) | `0` | 被写体周囲のパディング率 |
| `facePreset` | string | `"head-shoulders"` | `mode=face` の場合のプリセットフレーミング |
| `sensitivity` | number (0-1) | `0.5` | 顔検出のしきい値 |
| `threshold` | integer (0-255) | `30` | 背景検出のしきい値(トリムモード) |
| `padToSquare` | boolean | `false` | トリムした結果を正方形にパディングする |
| `padColor` | string | `"#ffffff"` | 正方形パディング用の背景色 |
| `targetSize` | integer | - | パディング後の出力ターゲットサイズ(ピクセル) |
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
| `language` | string | `"auto"` | 言語: `auto`、`en`、`de`、`fr`、`es`、`zh`、`ja`、`ko`、`id`、`th`、`vi` |
| `outputFormat` | `"txt"` \| `"srt"` \| `"vtt"` | `"txt"` | 出力形式 |

## 自動字幕 {#auto-subtitles}

**ツールルート:** `auto-subtitles`  
**モデル:** faster-whisper(動画から音声を抽出し、文字起こしする)

動画の音声トラックから字幕ファイルを生成します。

| パラメータ | 型 | デフォルト | 説明 |
|-----------|------|---------|-------------|
| `language` | string | `"auto"` | 言語: `auto`、`en`、`de`、`fr`、`es`、`zh`、`ja`、`ko`、`id`、`th`、`vi` |
| `format` | `"srt"` \| `"vtt"` | `"srt"` | 出力字幕形式 |

## PNG 透過修正 {#png-transparency-fixer}

**ツールルート:** `transparency-fixer`  
**モデル:** BiRefNet HR-matting(2048x2048 解像度)

背景は除去されたものの、フリンジ、ハロー、または半透明のアーティファクトが残った「偽の透過」PNG を修正します。BiRefNet の高解像度マッティングモデルを使用してクリーンなアルファチャンネルを生成し、その後、設定可能なデフリンジ処理を適用してエッジに沿った色の混入を除去します。

**OOM フォールバックチェーン:** BiRefNet HR-matting が利用可能なメモリを超過した場合、ツールは自動的に `birefnet-general` にフォールバックし、その後 `u2net` にフォールバックします。

| パラメータ | 型 | デフォルト | 説明 |
|-----------|------|---------|-------------|
| `defringe` | number (0-100) | `30` | 色の混入を除去するためのエッジデフリンジの強度 |
| `outputFormat` | `"png"` \| `"webp"` | `"png"` | 出力画像形式 |
| `removeWatermark` | boolean | `false` | 透かし除去の前処理(メディアンフィルタ)を適用する |

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/transparency-fixer \
  -H "Authorization: Bearer <token>" \
  -F "file=@fake-transparent.png" \
  -F 'settings={"defringe":30,"outputFormat":"png"}'
```

---

## オプションの AI 機能を備えたツール {#tools-with-optional-ai-capabilities}

以下のツールは Python サイドカーツールではありませんが、特定のオプションが有効な場合に AI 機能を使用します。

### 画像補正 {#image-enhancement}

**ツールルート:** `image-enhancement`  
**エンジン:** 解析ベース(Sharp のヒストグラムと統計)

画像を解析し、露出、コントラスト、ホワイトバランス、彩度、シャープネス、ノイズに対する自動補正を適用します。シーン別のモードに対応しています。

| パラメータ | 型 | デフォルト | 説明 |
|-----------|------|---------|-------------|
| `mode` | `"auto"` \| `"portrait"` \| `"landscape"` \| `"low-light"` \| `"food"` \| `"document"` | `"auto"` | 補正を調整するシーンモード |
| `intensity` | number (0-100) | `50` | 全体的な補正の強度 |
| `corrections.exposure` | boolean | `true` | 露出補正を適用する |
| `corrections.contrast` | boolean | `true` | コントラスト補正を適用する |
| `corrections.whiteBalance` | boolean | `true` | ホワイトバランス補正を適用する |
| `corrections.saturation` | boolean | `true` | 彩度補正を適用する |
| `corrections.sharpness` | boolean | `true` | シャープネス補正を適用する |
| `corrections.denoise` | boolean | `true` | ノイズ除去を適用する |
| `deepEnhance` | boolean | `false` | SCUNet を介した AI ノイズ除去を有効にする(`upscale-enhance` バンドルが必要) |

適用せずに検出された補正を返す解析エンドポイントが `POST /api/v1/tools/image/image-enhancement/analyze` で利用できます。

### コンテンツ対応リサイズ(シームカービング) {#content-aware-resize-seam-carving}

**ツールルート:** `content-aware-resize`  
**エンジン:** Go `caire` バイナリ(Python ではなく、GPU の恩恵はありません)

低エネルギーのシームを除去することで画像をインテリジェントにリサイズし、重要なコンテンツを保持します。

| パラメータ | 型 | デフォルト | 説明 |
|-----------|------|---------|-------------|
| `width` | number | - | ターゲット幅 |
| `height` | number | - | ターゲット高さ |
| `protectFaces` | boolean | `false` | 検出された顔領域を保護する(`face-detection` バンドルが必要) |
| `blurRadius` | number (0-20) | `4` | エネルギー計算のための事前ぼかし |
| `sobelThreshold` | number (1-20) | `2` | エッジ感度のしきい値 |
| `square` | boolean | `false` | 正方形出力を強制する |
