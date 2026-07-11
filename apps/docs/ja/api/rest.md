---
description: "完全な REST API リファレンス。ツールエンドポイント、バッチ処理、パイプライン、ファイルライブラリ、認証、チーム、管理者操作。"
i18n_source_hash: 8646977f7cc9
i18n_provenance: machine
i18n_output_hash: aa42f6d4ddbe
---

# REST API リファレンス {#rest-api-reference}

リクエスト/レスポンスの例を含むインタラクティブな API ドキュメントは [http://localhost:1349/api/docs](http://localhost:1349/api/docs) で利用できます。

機械可読な仕様:
- `/api/v1/openapi.yaml` - OpenAPI 3.1 仕様
- `/llms.txt` - LLM 向けのサマリー
- `/llms-full.txt` - LLM 向けの完全なドキュメント

## 認証 {#authentication}

`AUTH_ENABLED=false`でない限り、すべてのエンドポイントは認証を必要とします。

### セッショントークン {#session-token}

```bash
# Login
curl -X POST http://localhost:1349/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}'
# Returns: {"token":"<session-token>"}

# Use token
curl http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer <session-token>"
```

セッションは 7 日後に期限切れになります（`SESSION_DURATION_HOURS` で設定可能）。

### API キー {#api-keys}

```bash
# Create a key (returns key once - store it)
curl -X POST http://localhost:1349/api/v1/api-keys \
  -H "Authorization: Bearer <session-token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"my-script"}'
# Returns: {"key":"si_<96 hex chars>","id":"...","name":"my-script"}

# Use the key
curl http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_<your-key>"
```

キーには `si_` というプレフィックスが付き、scrypt ハッシュとして保存されます。生のキーは一度だけ表示され、二度と取得できません。

### 認証エンドポイント {#auth-endpoints}

| メソッド | パス | アクセス | 説明 |
|--------|------|--------|-------------|
| `POST` | `/api/auth/login` | Public | ログインしてセッショントークンを取得 |
| `POST` | `/api/auth/logout` | Auth | 現在のセッションを破棄 |
| `GET` | `/api/auth/session` | Auth | 現在のセッションを検証 |
| `POST` | `/api/auth/change-password` | Auth | 自分のパスワードを変更（他のすべてのセッションと API キーを無効化） |
| `GET` | `/api/auth/users` | Admin | すべてのユーザーを一覧表示 |
| `POST` | `/api/auth/register` | Admin | 新しいユーザーを作成 |
| `PUT` | `/api/auth/users/:id` | Admin | ユーザーのロールまたはチームを更新 |
| `POST` | `/api/auth/users/:id/reset-password` | Admin | ユーザーのパスワードをリセット |
| `DELETE` | `/api/auth/users/:id` | Admin | ユーザーを削除 |
| `GET` | `/api/v1/config/auth` | Public | 認証が有効かどうかを確認（`{ authEnabled: bool }`） |
| `POST` | `/api/auth/mfa/enroll` | Auth | TOTP MFA 登録を開始。エンタープライズの `mfa` 機能が必要 |
| `POST` | `/api/auth/mfa/verify` | Auth | TOTP コードで MFA 登録を確定 |
| `POST` | `/api/auth/mfa/complete` | Public | 保留中の MFA ログインチャレンジを完了 |
| `POST` | `/api/auth/mfa/disable` | Auth | 現在のユーザーの MFA を無効化 |
| `POST` | `/api/auth/users/:id/mfa/reset` | Admin（`users:manage`） | ユーザーの MFA をリセット |
| `GET` | `/api/auth/oidc/login` | Public | OIDC が有効なとき OIDC ログインを開始 |
| `GET` | `/api/auth/oidc/callback` | Public | OIDC 認可コールバック |
| `GET` | `/api/auth/saml/metadata` | Public | SAML が有効なときの SAML SP メタデータ XML |
| `GET` | `/api/auth/saml/login` | Public | SAML ログインを開始 |
| `POST` | `/api/auth/saml/callback` | Public | SAML アサーションコンシューマーサービス |

ユーザーに対して MFA が有効な場合、`POST /api/auth/login` はセッショントークンの代わりに `{"requiresMfa":true,"mfaToken":"...","mfaRequired":true|false}` を返します。その `mfaToken` と TOTP またはリカバリコードを `/api/auth/mfa/complete` に送信してください。

### パーミッション {#permissions}

| パーミッション | Admin | User |
|-----------|:-----:|:----:|
| ツールを使用 | ✓ | ✓ |
| 自分のファイル/パイプライン/API キー | ✓ | ✓ |
| 全ユーザーのファイル/パイプライン/キーを閲覧 | ✓ | - |
| 設定の書き込み | ✓ | - |
| ユーザーとチームの管理 | ✓ | - |
| ブランディングの管理 | ✓ | - |

## ヘルスチェック {#health-check}

| メソッド | パス | アクセス | 説明 |
|--------|------|--------|-------------|
| `GET` | `/api/v1/health` | Public | 基本的なヘルスチェック。200 で `{"status":"healthy","version":"..."}` を返し、データベースに到達できない場合は 503 で `{"status":"unhealthy"}` を返します。 |
| `GET` | `/api/v1/readyz` | Public | レディネスプローブ。PostgreSQL、Redis、ディスク容量、および設定されている場合は S3 をチェックします。インスタンスがトラフィックを受け取るべきでない場合は 503 を返します。 |
| `GET` | `/api/v1/admin/health` | Admin（`system:health`） | 稼働時間、ストレージモード、データベースステータス、キューの状態、GPU の可用性を含む詳細な診断。 |

## ツールの使用 {#using-tools}

すべてのツールは同じパターンに従います:

```bash
# Single file
curl -X POST http://localhost:1349/api/v1/tools/<section>/<toolId> \
  -H "Authorization: Bearer <token>" \
  -F "file=@input.jpg" \
  -F 'settings={"width":800,"height":600}'

# Batch (returns ZIP)
curl -X POST http://localhost:1349/api/v1/tools/<section>/<toolId>/batch \
  -H "Authorization: Bearer <token>" \
  -F "files=@a.jpg" \
  -F "files=@b.jpg" \
  -F 'settings={...}'
```

`<section>` は `image`、`video`、`audio`、`pdf`、`files` のいずれかです。

- アップロードは `multipart/form-data` です。
- `settings` はツール固有のオプションを含む JSON 文字列です。
- `clientJobId` は、呼び出し元が指定する進捗相関のためのオプションのフォームフィールドです。
- `fileId` は、既存のファイルライブラリ項目を参照するオプションのフォームフィールドです。存在する場合、処理された出力は新しいバージョンとして保存され、レスポンスに `savedFileId` が含まれます。
- **高速ツール** は通常 200 JSON を返します: `{"jobId":"...","downloadUrl":"/api/v1/download/<jobId>/<filename>","originalSize":1234,"processedSize":567}`。処理されたファイルは `downloadUrl` から取得します。
- **キューに入るツール** は、長時間実行される場合や同期待機ウィンドウを超える場合、202 JSON を返すことがあります: `{"jobId":"...","async":true}`。進捗のために SSE に接続し、完了したらダウンロードします（[進捗トラッキング](#progress-tracking) を参照）。
- **バッチ** ルートは、汎用バッチレジストリに登録されたツールについて、ZIP アーカイブを直接ストリーミングして返します（`X-Job-Id` ヘッダー付き）。

## ツールリファレンス {#tools-reference}

### 変換プリセット {#conversion-presets}

共有カタログには、`jpg-to-png`、`mov-to-mp4`、`m4a-to-mp3`、`pdf-to-jpg`、`excel-to-csv` など、83 個の専用変換プリセットエンドポイントが含まれています。プリセットはファーストクラスのツールルートです:

`POST /api/v1/tools/<section>/<presetId>`

各プリセットは出力形式を固定し、`convert`、`convert-video`、`extract-audio`、`convert-audio`、`image-to-pdf`、`pdf-to-image`、`svg-to-raster`、`convert-spreadsheet` などのベースツールに委譲します。完全なルートテーブルとオプション設定については、[変換プリセット](/ja/tools/conversion-presets) を参照してください。

### 基本ツール {#essentials}

| ツール ID | 名前 | 主な設定 |
|---------|------|-------------|
| `resize` | リサイズ | `width`, `height`, `fit`（cover/contain/fill/inside/outside）, `percentage`, `withoutEnlargement`, 加えて 23 種類のソーシャルメディアプリセット |
| `crop` | クロップ | `left`, `top`, `width`, `height`, `unit`（px/percent） |
| `rotate` | 回転と反転 | `angle`, `horizontal`（bool）, `vertical`（bool） |
| `convert` | 変換 | `format`（jpg/png/webp/avif/tiff/gif/heic/heif）, `quality` |
| `compress` | 圧縮 | `mode`（quality/targetSize）, `quality`（1–100）, `targetSizeKb` |

### 最適化 {#optimization}

| ツール ID | 名前 | 主な設定 |
|---------|------|-------------|
| `optimize-for-web` | Web 向け最適化 | `format`（webp/jpeg/avif/png）, `quality`, `maxWidth`, `maxHeight`, `progressive`, `stripMetadata` |
| `strip-metadata` | メタデータ削除 | - |
| `edit-metadata` | メタデータ編集 | `title`, `description`, `author`, `copyright`, `keywords`, `gps`（lat/lon）, `dateTime` |
| `bulk-rename` | 一括リネーム | `pattern`（`{n}`, `{date}`, `{original}` に対応）, `startIndex`, `padding` |
| `image-to-pdf` | 画像から PDF | `pageSize`（A4/Letter/...）, `orientation`, `margin`, `targetSize`（{value, unit}） |
| `favicon` | ファビコンジェネレーター | `padding`, `backgroundColor`, `borderRadius` - 標準サイズをすべて生成 |

### 調整 {#adjustments}

| ツール ID | 名前 | 主な設定 |
|---------|------|-------------|
| `adjust-colors` | 色の調整 | `brightness`, `contrast`, `exposure`, `saturation`, `temperature`, `tint`, `hue`, `sharpness`, `red`, `green`, `blue`, `effect`（none/grayscale/sepia/invert） |
| `sharpening` | シャープニング | `method`（adaptive/unsharp-mask/high-pass）, `sigma`, `m1`, `m2`, `x1`, `y2`, `y3`, `amount`, `radius`, `threshold`, `strength`, `kernelSize`（3/5）, `denoise`（off/light/medium/strong） |
| `replace-color` | 色の置換 | `sourceColor`, `targetColor`（置換色）, `makeTransparent`, `tolerance` |
| `color-blindness` | 色覚異常シミュレーション | `simulationType`（protanopia/deuteranopia/tritanopia/protanomaly/deuteranomaly/tritanomaly/achromatopsia/blueConeMonochromacy、デフォルト "deuteranomaly"） |
| `duotone` | デュオトーン | `shadow`（hex）, `highlight`（hex）, `intensity`（0-100） |
| `pixelate` | ピクセレート | `blockSize`（2-128）, `region`（部分的なピクセレートのための {left, top, width, height}） |
| `vignette` | ビネット | `strength`（0.1-1）, `color`（hex）, `radius`, `softness`, `roundness`, `centerX`, `centerY` |

### AI ツール {#ai-tools}

すべての AI ツールはお使いのハードウェア上で動作します。デフォルトでは CPU、サポートされている NVIDIA GPU が利用可能な場合は NVIDIA CUDA を使用します。VA-API、Quick Sync、OpenCL による Intel/AMD iGPU アクセラレーションは、現在 AI 推論ではサポートされていません。インターネット接続は不要です。

| ツール ID | 名前 | AI モデル | 主な設定 |
|---------|------|---------|-------------|
| `remove-background` | 背景の削除 | rembg（BiRefNet / U2-Net） | `model`, `backgroundType`（transparent/color/gradient/blur/image）, `backgroundColor`, `gradientColor1`, `gradientColor2`, `gradientAngle`, `blurEnabled`, `blurIntensity`, `shadowEnabled`, `shadowOpacity` |
| `upscale` | 画像のアップスケール | RealESRGAN | `scale`（2/4）, `model`, `faceEnhance`, `denoise`, `format`, `quality` |
| `erase-object` | オブジェクト消しゴム | LaMa（ONNX） | マスクは 2 番目のファイルパートとして送信（フィールド名 `mask`）, `format`, `quality` |
| `ocr` | OCR / テキスト抽出 | PaddleOCR / Tesseract | `quality`（fast/balanced/best）, `language`, `enhance` |
| `blur-faces` | 顔 / PII ぼかし | MediaPipe | `blurRadius`, `sensitivity` |
| `smart-crop` | スマートクロップ | MediaPipe + Sharp | `mode`（subject/face/trim）, `strategy`（attention/entropy）, `width`, `height`, `padding`, `facePreset`（closeup/head-shoulders/upper-body/half-body）, `sensitivity`, `threshold`, `padToSquare`, `padColor`, `targetSize`, `quality` |
| `image-enhancement` | 画像の強調 | 解析ベース | `mode`（auto/exposure/contrast/color/sharpness）, `strength` |
| `enhance-faces` | 顔の強調 | GFPGAN / CodeFormer | `model`（gfpgan/codeformer）, `strength`, `sensitivity`, `centerFace` |
| `colorize` | AI カラー化 | DDColor | `intensity`, `model` |
| `noise-removal` | ノイズ除去 | 段階的デノイズ | `tier`（quick/balanced/quality/maximum）, `strength`, `detailPreservation`, `colorNoise`, `format`, `quality` |
| `red-eye-removal` | 赤目除去 | 顔ランドマーク + 色解析 | `sensitivity`, `strength` |
| `restore-photo` | 写真復元 | 複数ステップのパイプライン | `mode`（auto/light/heavy）, `scratchRemoval`, `faceEnhancement`, `fidelity`, `denoise`, `denoiseStrength`, `colorize` |
| `passport-photo` | パスポート写真 | MediaPipe ランドマーク | 2 フェーズフロー。解析はマルチパート `file` を使用。生成は `countryCode`, `bgColor`, `printLayout`（none/4x6/a4）, ランドマーク, 画像寸法を含む JSON を使用 |
| `content-aware-resize` | コンテンツ認識リサイズ | シームカービング（caire） | `width`, `height`, `protectFaces`, `blurRadius`, `sobelThreshold`, `square` |
| `transparency-fixer` | PNG 透明度フィクサー | BiRefNet HR-matting | `defringe`（0-100）, `outputFormat`（png/webp） |
| `background-replace` | 背景の置き換え | rembg（BiRefNet） | `backgroundType`（color/gradient）, `color`（hex）, `gradientColor1`, `gradientColor2`, `gradientAngle`, `feather`（0-20）, `format`（png/webp） |
| `blur-background` | 背景ぼかし | rembg（BiRefNet） | `intensity`（1-100）, `feather`（0-20）, `format`（png/webp） |
| `ai-canvas-expand` | AI キャンバス拡張 | LaMa（アウトペインティング） | `extendTop`, `extendRight`, `extendBottom`, `extendLeft`（px）, `tier`（fast/balanced/high）, `format`, `quality` |

### ウォーターマークとオーバーレイ {#watermark-overlay}

| ツール ID | 名前 | 主な設定 |
|---------|------|-------------|
| `watermark-text` | テキストウォーターマーク | `text`, `font`, `fontSize`, `color`, `opacity`, `position`, `rotation`, `tile` |
| `watermark-image` | 画像ウォーターマーク | `opacity`, `position`, `scale` - 2 番目のファイルがウォーターマーク |
| `text-overlay` | テキストオーバーレイ | `text`, `font`, `fontSize`, `color`, `x`, `y`, `background`, `padding`, `borderRadius` |
| `compose` | 画像合成 | `x`, `y`, `opacity`, `blend` - 2 番目のファイルが上にレイヤーされる |
| `meme-generator` | ミームジェネレーター | `templateId`, `textLayout`（top-bottom/top-only/bottom-only/center/side-by-side）, `textBoxes`（[{id, text}]）, `fontFamily`（anton/arial-black/comic-sans/montserrat/bebas-neue/permanent-marker/roboto）, `fontSize`, `textColor`, `strokeColor`, `textAlign`, `allCaps`。テンプレートモード（`templateId` を含む JSON ボディ）またはカスタム画像モード（ファイル付きマルチパート）に対応。 |

### ユーティリティ {#utilities}

| ツール ID | 名前 | 主な設定 |
|---------|------|-------------|
| `info` | 画像情報 | -（width, height, format, size, channels, hasAlpha, DPI, EXIF を返す） |
| `compare` | 画像比較 | `mode`（side-by-side/overlay/diff）, `diffThreshold` - 2 番目のファイルが比較対象 |
| `find-duplicates` | 重複の検出 | `threshold`（知覚ハッシュ距離、デフォルト 8） - 複数ファイル |
| `color-palette` | カラーパレット | `count`（主要色の数）, `format`（hex/rgb） |
| `qr-generate` | QR コードジェネレーター | `data`, `size`, `margin`, `colorDark`, `colorLight`, `errorCorrectionLevel`, `dotStyle`, `cornerStyle`, `logo`（オプションのファイル） |
| `barcode-read` | バーコードリーダー | -（QR, EAN, Code128, DataMatrix などを自動検出） |
| `image-to-base64` | 画像から Base64 | `format`（data-uri/plain）, `mimeType` |
| `html-to-image` | HTML から画像 | `url`, `format`（png/jpg/webp）, `quality`, `fullPage`, `devicePreset`（desktop/tablet/mobile/custom）, `viewportWidth`, `viewportHeight` |
| `histogram` | ヒストグラム | `scale`（linear/log） - RGB ヒストグラムチャートとチャンネルごとの統計を返す |
| `lqip-placeholder` | LQIP プレースホルダー | `width`（4-64）, `blur`, `strategy`（blur/pixelate/solid）, `format`（webp/png/jpeg）, `quality` |
| `barcode-generate` | バーコードジェネレーター | `text`, `type`（code128/ean13/upca/code39/itf14/datamatrix）, `scale`（1-8）, `includeText`（bool）。JSON ボディ、ファイルアップロードなし。 |

### レイアウトと構成 {#layout-composition}

| ツール ID | 名前 | 主な設定 |
|---------|------|-------------|
| `collage` | コラージュ / グリッド | `template`（25 以上のレイアウト）, `gap`, `backgroundColor`, `borderRadius` - 複数ファイル |
| `stitch` | 連結 / 結合 | `direction`（horizontal/vertical/grid）, `gap`, `backgroundColor`, `alignment` - 複数ファイル |
| `split` | 画像分割 | `mode`（grid/rows/cols）, `rows`, `cols`, `tileWidth`, `tileHeight` |
| `border` | ボーダーとフレーム | `width`, `color`, `style`（solid/gradient/pattern）, `borderRadius`, `padding`, `shadow` |
| `beautify` | スクリーンショットの装飾 | `backgroundType`（solid/linear-gradient/radial-gradient/image/transparent）, `gradientStops`, `padding`, `borderRadius`, `shadowPreset`, `frame`（none/macos-light/macos-dark/windows-light/windows-dark/browser-light/browser-dark/iphone/macbook/ipad/...）, `socialPreset`（none/twitter/linkedin/instagram-square/instagram-story/facebook/producthunt）, `watermarkText`, `outputFormat` |
| `circle-crop` | 円形クロップ | `zoom`（1-5）, `offsetX`, `offsetY`, `borderWidth`, `borderColor`, `background`（transparent/hex）, `outputSize` |
| `image-pad` | 画像パディング | `target`（16:9/9:16/1:1/4:3/3:4/custom）, `ratioW`, `ratioH`, `background`（color/transparent/blur）, `color`（hex）, `padding`（0-50%） |
| `sprite-sheet` | スプライトシート | `columns`（1-16）, `padding`, `background`（hex）, `format`（png/webp/jpeg）, `quality` - 複数ファイル（2-64 枚の画像） |

### 形式と変換 {#format-conversion}

| ツール ID | 名前 | 主な設定 |
|---------|------|-------------|
| `svg-to-raster` | SVG からラスター | `format`（png/jpeg/webp/avif/tiff/gif/heif）, `width`, `height`, `scale`, `dpi`, `background` |
| `vectorize` | 画像から SVG | `colorMode`（bw/color）, `threshold`, `colorPrecision`, `filterSpeckle`, `pathMode`（none/polygon/spline） |
| `gif-tools` | GIF ツール | `action`（resize/optimize/reverse/speed/extract-frames/rotate/add-text）, アクション固有のパラメータ |
| `gif-webp` | GIF/WebP コンバーター | `quality`（1-100）, `lossless`（bool）, `resizePercent`（10-100） |

### 動画ツール {#video-tools}

| ツール ID | 名前 | 主な設定 |
|---------|------|-------------|
| `convert-video` | 動画の変換 | `format`（mp4/mov/webm/avi/mkv）, `quality`（high/balanced/small） |
| `compress-video` | 動画の圧縮 | `quality`（light/balanced/strong）, `resolution`（original/1080p/720p/480p） |
| `trim-video` | 動画のトリミング | `startS`, `endS`, `precise`（bool、フレーム精度のカット） |
| `mute-video` | 動画のミュート | - |
| `video-to-gif` | 動画から GIF | `fps`（1-30）, `width`, `startS`, `durationS`（最大 60 秒） |
| `resize-video` | 動画のリサイズ | `width`, `height`, `preset`（custom/2160p/1440p/1080p/720p/480p/360p） |
| `crop-video` | 動画のクロップ | `width`, `height`, `x`, `y` |
| `rotate-video` | 動画の回転 | `transform`（cw90/ccw90/180/hflip/vflip） |
| `change-fps` | FPS の変更 | `fps`（1-120） |
| `video-color` | 動画の色調整 | `brightness`, `contrast`, `saturation`, `gamma` |
| `video-speed` | 動画の速度 | `factor`（0.25-4）, `keepPitch`（bool） |
| `reverse-video` | 動画の逆再生 | -（最大 5 分） |
| `video-loudnorm` | 音声のノーマライズ | -（EBU R128） |
| `aspect-pad` | アスペクトパディング | `target`（16:9/9:16/1:1/4:3/3:4）, `color`（hex） |
| `blur-pad` | ぼかしパディング | `target`（16:9/9:16/1:1/4:3/3:4）, `blur`（2-50） |
| `watermark-video` | 動画のウォーターマーク | `text`, `position`, `fontSize`, `opacity`, `color` |
| `stabilize-video` | 動画の手ぶれ補正 | `smoothing`（5-60、フレーム単位） |
| `gif-to-video` | GIF から動画 | `format`（mp4/webm/mov） |
| `video-to-webp` | 動画から WebP | `fps`, `width`, `quality`, `loop`（bool） |
| `video-to-frames` | 動画からフレーム | `mode`（all/nth/timestamps）, `n`, `timestamps`, `format`（png/jpg） |
| `merge-videos` | 動画の結合 | -（複数ファイル、最初の動画の解像度にノーマライズ） |
| `replace-audio` | 音声の置き換え | -（動画 + 音声ファイル、2 ファイル） |
| `burn-subtitles` | 字幕の焼き込み | `fontSize`（8-72） - 動画 + 字幕ファイル |
| `embed-subtitles` | 字幕の埋め込み | `language`（ISO 639-2/B コード） - 動画 + 字幕ファイル |
| `extract-subtitles` | 字幕の抽出 | -（SRT を出力） |
| `images-to-video` | 画像から動画 | `secondsPerImage`（0.5-10）, `resolution`（1080p/720p/square）, `fps` - 複数ファイル |
| `video-metadata` | 動画メタデータのクリーン | - |
| `auto-subtitles` | 自動字幕（AI） | `language`（auto/en/de/fr/es/zh/ja/ko/id/th/vi）, `format`（srt/vtt） |
| `extract-audio` | 音声の抽出 | `format`（mp3/wav/m4a/ogg） |

### 音声ツール {#audio-tools}

| ツール ID | 名前 | 主な設定 |
|---------|------|-------------|
| `convert-audio` | 音声の変換 | `format`（mp3/wav/ogg/flac/m4a）, `bitrateKbps`（32-320） |
| `trim-audio` | 音声のトリミング | `startS`, `endS` |
| `volume-adjust` | 音量調整 | `gainDb`（-30 から 30） |
| `normalize-audio` | 音声のノーマライズ | -（EBU R128、-16 LUFS） |
| `fade-audio` | 音声のフェード | `fadeInS`（0-30）, `fadeOutS`（0-30） |
| `reverse-audio` | 音声の逆再生 | - |
| `audio-speed` | 音声の速度 | `factor`（0.25-4） |
| `pitch-shift` | ピッチシフト | `semitones`（-12 から 12） |
| `audio-channels` | 音声チャンネル | `mode`（stereo-to-mono/mono-to-stereo/swap） |
| `silence-removal` | 無音の除去 | `thresholdDb`（-80 から -20）, `minSilenceS`（0.1-5） |
| `noise-reduction` | ノイズ低減 | `strength`（light/medium/strong） |
| `merge-audio` | 音声の結合 | `format`（mp3/wav/flac/m4a） - 複数ファイル |
| `split-audio` | 音声の分割 | `mode`（time/parts/silence）, `segmentS`, `parts`, `thresholdDb`, `minSilenceS` |
| `ringtone-maker` | 着信音メーカー | `startS`, `durationS`（1-30） |
| `waveform-image` | 波形画像 | `width`, `height`, `color`（hex） |
| `audio-metadata` | 音声メタデータ | `strip`（bool）, `title`, `artist`, `album` |
| `transcribe-audio` | 音声の文字起こし（AI） | `language`（auto/en/de/fr/es/zh/ja/ko/id/th/vi）, `outputFormat`（txt/srt/vtt） |

### ドキュメントツール {#document-tools}

| ツール ID | 名前 | 主な設定 |
|---------|------|-------------|
| `merge-pdf` | PDF の結合 | -（複数ファイル、最大 20 個の PDF） |
| `split-pdf` | PDF の分割 | `mode`（range/every）, `range`, `everyN`（1-500） |
| `compress-pdf` | PDF の圧縮 | `mode`（quality/targetSize）, `quality`（1-100）, `targetSizeKb` |
| `rotate-pdf` | PDF の回転 | `angle`（90/180/270）, `range`（ページ範囲） |
| `extract-pages` | ページの抽出 | `range`（qpdf 構文、例 "1-5,8,10-z"） |
| `remove-pages` | ページの削除 | `pages`（削除する qpdf 範囲） |
| `organize-pdf` | PDF の整理 | `order`（qpdf ページ順、例 "3,1,2,5-z"） |
| `protect-pdf` | PDF の保護 | `userPassword`, `ownerPassword`（AES-256） |
| `unlock-pdf` | PDF のロック解除 | `password` |
| `repair-pdf` | PDF の修復 | - |
| `linearize-pdf` | PDF の Web 最適化 | -（高速な Web 表示のためにリニアライズ） |
| `grayscale-pdf` | PDF のグレースケール化 | - |
| `pdfa-convert` | PDF/A 変換 | -（アーカイブ用 PDF/A-2） |
| `crop-pdf` | PDF のクロップ | `margin`（0-2000 ポイント） |
| `nup-pdf` | N-up PDF | `perSheet`（2/3/4/8/9/12/16） |
| `booklet-pdf` | ブックレット PDF | `perSheet`（2/4/6/8） |
| `watermark-pdf` | PDF のウォーターマーク | `text`, `position`, `fontSize`, `opacity`, `rotation` |
| `pdf-page-numbers` | PDF ページ番号 | `position`（bl/bc/br/tl/tc/tr）, `fontSize` |
| `flatten-pdf` | PDF のフラット化 | -（フォームと注釈を焼き込む） |
| `redact-pdf` | PDF の墨消し | `terms`（string[]）, `caseSensitive`（bool） |
| `sign-pdf` | PDF の署名 | PDF `file`、署名ファイル `sig0`、`sig1`、`placements` JSON 配列を含むカスタムマルチパートルート |
| `pdf-to-text` | PDF からテキスト | - |
| `pdf-to-word` | PDF から Word | - |
| `pdf-metadata` | PDF メタデータ | `title`, `author`, `subject`, `keywords` |
| `convert-document` | ドキュメントの変換 | `format`（docx/odt/rtf/txt） |
| `convert-presentation` | プレゼンテーションの変換 | `format`（pptx/odp） |
| `convert-spreadsheet` | スプレッドシートの変換 | `format`（xlsx/ods/csv） |
| `excel-to-pdf` | Excel から PDF | - |
| `word-to-pdf` | Word から PDF | - |
| `powerpoint-to-pdf` | PowerPoint から PDF | - |
| `html-to-pdf` | HTML から PDF | -（リモートリソースは無効） |
| `markdown-to-docx` | Markdown から Word | - |
| `markdown-to-html` | Markdown から HTML | - |
| `markdown-to-pdf` | Markdown から PDF | -（リモートリソースは無効） |
| `epub-convert` | EPUB の変換 | `format`（pdf/docx/html/md） |
| `to-epub` | EPUB への変換 | -（.docx, .md, .html, .txt を受け付け） |
| `ocr-pdf` | PDF OCR（AI） | `quality`（fast/balanced/best）, `language`（auto/en/de/fr/es/zh/ja/ko）, `pages` |
| `pdf-to-image` | PDF から画像 | `pages`（all/range）, `format`, `dpi`, `quality` |
| `pdf-to-jpg` | PDF から JPG | `pages`, `dpi`, `quality`, `colorMode` |
| `pdf-to-png` | PDF から PNG | `pages`, `dpi`, `quality`, `colorMode` |
| `pdf-to-tiff` | PDF から TIFF | `pages`, `dpi`, `quality`, `colorMode` |

### ファイルツール {#file-tools}

| ツール ID | 名前 | 主な設定 |
|---------|------|-------------|
| `chart-maker` | チャートメーカー | `kind`（bar/line/pie）, `title`, `width`, `height` |
| `csv-excel` | CSV から Excel | `sheet`（XLSX 入力のワークシート番号） - 双方向 |
| `csv-json` | CSV から JSON | `pretty`（bool） - 双方向 |
| `json-xml` | JSON から XML | `pretty`（bool） - 双方向 |
| `split-csv` | CSV の分割 | `rowsPerFile`（1-1000000）, `keepHeader`（bool） |
| `merge-csvs` | CSV の結合 | -（複数ファイル、列が一致するもの） |
| `yaml-json` | YAML / JSON | -（双方向） |
| `xml-to-csv` | XML から CSV | -（繰り返し要素を自動検出） |
| `excel-to-csv` | Excel から CSV | `convert-spreadsheet` を基盤とする専用の変換プリセット |
| `create-zip` | ZIP の作成 | -（複数ファイル、2-50 ファイル） |
| `extract-zip` | ZIP の展開 | -（ボム対策済み） |

### HTML から画像 {#html-to-image}

Web ページを画像としてキャプチャします。他のツールと異なり、このエンドポイントはマルチパートフォームデータの代わりに `application/json` を受け付けます（ファイルアップロードは不要）。

**エンドポイント:** `POST /api/v1/tools/image/html-to-image`

**Content-Type:** `application/json`

| パラメータ | 型 | デフォルト | 説明 |
|-----------|------|---------|-------------|
| `url` | string | （必須） | キャプチャする URL（http/https のみ） |
| `format` | string | `"png"` | 出力形式: `jpg`, `png`, `webp` |
| `quality` | number | `90` | 品質 1-100（JPG/WebP のみ） |
| `fullPage` | boolean | `false` | スクロール可能なページ全体をキャプチャ |
| `devicePreset` | string | `"desktop"` | `desktop`, `tablet`, `mobile`, `custom` |
| `viewportWidth` | number | `1280` | カスタムビューポート幅 320-3840 |
| `viewportHeight` | number | `720` | カスタムビューポート高さ 320-2160 |

**例:**

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/html-to-image \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://snapotter.com", "format": "png", "devicePreset": "desktop"}'
```

**レスポンス:**

```json
{
  "jobId": "uuid",
  "downloadUrl": "/api/v1/download/{jobId}/screenshot.png",
  "originalSize": 0,
  "processedSize": 54321
}
```

### ツールのサブルート {#tool-sub-routes}

一部のツールは、標準の `POST /api/v1/tools/<section>/<toolId>` 以外に追加のエンドポイントを公開します:

| メソッド | パス | 説明 |
|--------|------|-------------|
| `GET` | `/api/v1/tools/popular` | 人気のツール ID を返す。使用データが乏しい場合はキュレーションされたデフォルトリストにフォールバック |
| `POST` | `/api/v1/tools/image/remove-background/effects` | AI を再実行せずに背景エフェクト（color/gradient/blur/shadow）を適用。初回削除時のキャッシュされたマスクを使用。 |
| `POST` | `/api/v1/tools/image/edit-metadata/inspect` | 画像から既存の EXIF/IPTC/XMP メタデータを読み取る |
| `POST` | `/api/v1/tools/image/strip-metadata/inspect` | 削除前にメタデータフィールドを確認 |
| `POST` | `/api/v1/tools/image/passport-photo/analyze` | フェーズ 1: AI 顔検出 + 背景削除。顔ランドマークとキャッシュデータを返す。 |
| `POST` | `/api/v1/tools/image/passport-photo/generate` | フェーズ 2: キャッシュされた解析を使ってクロップ、リサイズ、タイル化。AI の再実行なし。 |
| `POST` | `/api/v1/tools/image/gif-tools/info` | GIF メタデータ（フレーム数、寸法、再生時間）を取得 |
| `POST` | `/api/v1/tools/pdf/pdf-to-image/info` | PDF メタデータ（ページ数、寸法）を取得 |
| `POST` | `/api/v1/tools/pdf/pdf-to-image/preview` | 特定の PDF ページのプレビューを生成 |
| `POST` | `/api/v1/tools/pdf/pdf-to-jpg/info` | 専用の JPG プリセット向けの PDF メタデータを取得 |
| `POST` | `/api/v1/tools/pdf/pdf-to-jpg/preview` | JPG プリセットの PDF ページプレビューを生成 |
| `POST` | `/api/v1/tools/pdf/pdf-to-png/info` | 専用の PNG プリセット向けの PDF メタデータを取得 |
| `POST` | `/api/v1/tools/pdf/pdf-to-png/preview` | PNG プリセットの PDF ページプレビューを生成 |
| `POST` | `/api/v1/tools/pdf/pdf-to-tiff/info` | 専用の TIFF プリセット向けの PDF メタデータを取得 |
| `POST` | `/api/v1/tools/pdf/pdf-to-tiff/preview` | TIFF プリセットの PDF ページプレビューを生成 |
| `POST` | `/api/v1/tools/image/svg-to-raster/batch` | 複数の SVG を一括でラスターに変換 |
| `POST` | `/api/v1/tools/image/image-enhancement/analyze` | 画像品質を解析し、強調の推奨事項を返す |
| `POST` | `/api/v1/tools/image/optimize-for-web/preview` | ライブパラメータ調整のための軽量プレビュー。サイズヘッダー付きの最適化された画像を返す。 |

## バッチ処理 {#batch-processing}

汎用のバッチ対応ツールを複数のファイルに一度に適用します。ZIP アーカイブを返します。PDF 署名、PDF OCR、PDF から画像へのプリセットルートなど、カスタムの複数ファイルまたは複数ステップのルートは、汎用の `/batch` ルートの代わりに独自のエンドポイント契約を使用します。

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compress/batch \
  -H "Authorization: Bearer <token>" \
  -F "files=@a.jpg" \
  -F "files=@b.jpg" \
  -F "files=@c.jpg" \
  -F 'settings={"quality":80}'
```

並列度は `CONCURRENT_JOBS` で制御されます（デフォルト: CPU コアから自動検出）。`MAX_BATCH_SIZE` はバッチあたりのファイル数を制限します（デフォルト: 100、無制限にするには 0 を設定）。

## パイプライン {#pipelines}

### パイプラインの実行 {#execute-a-pipeline}

```bash
# Single file
curl -X POST http://localhost:1349/api/v1/pipeline/execute \
  -H "Authorization: Bearer <token>" \
  -F "file=@input.jpg" \
  -F 'pipeline={"steps":[
    {"toolId":"resize","settings":{"width":1200}},
    {"toolId":"compress","settings":{"quality":80}},
    {"toolId":"watermark-text","settings":{"text":"© 2025"}}
  ]}'

# Batch (multiple files → ZIP)
curl -X POST http://localhost:1349/api/v1/pipeline/batch \
  -H "Authorization: Bearer <token>" \
  -F "files=@a.jpg" \
  -F "files=@b.jpg" \
  -F 'pipeline={"steps":[{"toolId":"resize","settings":{"width":800}}]}'
```

各ステップの出力が次のステップの入力になります。パイプラインはデフォルトで 20 ステップまで許可され、`MAX_PIPELINE_STEPS` で設定可能です。`MAX_PIPELINE_STEPS=0` を設定すると制限が解除されます。

### パイプラインの保存と管理 {#save-and-manage-pipelines}

| メソッド | パス | 説明 |
|--------|------|-------------|
| `POST` | `/api/v1/pipeline/save` | 名前付きパイプラインを保存（`name`, `description`, `steps[]`） |
| `GET` | `/api/v1/pipeline/list` | 保存済みパイプラインを一覧表示（管理者はすべて、ユーザーは自分のものを閲覧） |
| `DELETE` | `/api/v1/pipeline/:id` | 削除（所有者または管理者） |
| `GET` | `/api/v1/pipeline/tools` | パイプラインステップに有効なツール ID を一覧表示 |

## 進捗トラッキング {#progress-tracking}

長時間実行されるジョブ、キューに入るツール、バッチジョブ、パイプラインは、Server-Sent Events を介してリアルタイムの進捗を送信します。進捗ストリームは公開されており、ジョブ ID をキーとしているため、クライアントは読み取りに Authorization ヘッダーを送信する必要はありません。

```bash
# Connect to the SSE stream (jobId is in the JSON response body from the tool endpoint)
curl -N http://localhost:1349/api/v1/jobs/<jobId>/progress
```

イベント形式:
```
data: {"jobId":"...","type":"single","phase":"processing","stage":"Upscaling","percent":42}
data: {"jobId":"...","type":"single","phase":"complete","percent":100,"result":{"downloadUrl":"/api/v1/download/..."}}
data: {"jobId":"...","type":"batch","status":"processing","completedFiles":2,"totalFiles":5,"failedFiles":0,"errors":[]}
```

`POST /api/v1/jobs/:jobId/cancel` を使って、キューに入っているまたは実行中のジョブのキャンセルをリクエストできます。レスポンスは `{"canceled":true|false}` です。

## ファイルライブラリ {#file-library}

バージョン履歴付きの永続的なファイルストレージ。

| メソッド | パス | 説明 |
|--------|------|-------------|
| `POST` | `/api/v1/upload` | ワークスペースにファイルをアップロード（一時的な処理用） |
| `POST` | `/api/v1/files/upload` | 永続的なファイルライブラリにファイルをアップロード |
| `POST` | `/api/v1/files/save-result` | ツール処理の結果を新しいファイルバージョンとして保存 |
| `GET` | `/api/v1/files` | 保存済みファイルを一覧表示（ページネーション、検索付き） |
| `GET` | `/api/v1/files/:id` | ファイルメタデータ + バージョンチェーンを取得 |
| `GET` | `/api/v1/files/:id/download` | ファイルをダウンロード |
| `GET` | `/api/v1/files/:id/thumbnail` | 300px の JPEG サムネイルを取得 |
| `DELETE` | `/api/v1/files` | ファイルとそのバージョンチェーンを一括削除（ボディ: `{ ids: [...] }`） |
| `POST` | `/api/v1/fetch-urls` | URL ベースのインポートのためにリモート URL をワークスペースに取得 |
| `POST` | `/api/v1/preview` | ブラウザ互換の WebP プレビューを生成（HEIC/HEIF/RAW 形式向け） |
| `GET` | `/api/v1/files/:id/preview` | 保存済みの PDF、Office ドキュメント、動画、音声ファイルについて、キャッシュされたまたは生成されたブラウザ互換プレビューをストリーミング |
| `POST` | `/api/v1/preview/generate` | アップロードされたメディアファイルを先に保存せずに、オンデマンドで MP4 または MP3 プレビューを生成 |
| `GET` | `/api/v1/download/:jobId/:filename` | ワークスペースから処理済みファイルをダウンロード |

ツールの結果をライブラリに自動保存するには、既存のライブラリファイルを参照する `fileId` をマルチパートフォームフィールドとして含めます。処理結果は新しいバージョンとして保存されます。

## API キー管理 {#api-key-management}

| メソッド | パス | アクセス | 説明 |
|--------|------|--------|-------------|
| `POST` | `/api/v1/api-keys` | Auth | 新しいキーを生成 - 一度だけ表示 |
| `GET` | `/api/v1/api-keys` | Auth | キーを一覧表示（name, id, lastUsedAt - 生のキーは含まない） |
| `DELETE` | `/api/v1/api-keys/:id` | Auth | キーを削除 |

## チーム {#teams}

| メソッド | パス | アクセス | 説明 |
|--------|------|--------|-------------|
| `GET` | `/api/v1/teams` | Admin（`teams:manage`） | チームを一覧表示 |
| `POST` | `/api/v1/teams` | Admin（`teams:manage`） | チームを作成 |
| `PUT` | `/api/v1/teams/:id` | Admin（`teams:manage`） | チームを名前変更 |
| `DELETE` | `/api/v1/teams/:id` | Admin（`teams:manage`） | チームを削除（デフォルトチームやメンバーがいるチームは削除不可） |

## 設定 {#settings}

ランタイムのキー・バリュー設定（認証済みユーザーは誰でも読み取り可能、書き込みは管理者のみ）。

| メソッド | パス | 説明 |
|--------|------|-------------|
| `GET` | `/api/v1/settings` | すべての設定を取得 |
| `PUT` | `/api/v1/settings` | 設定を一括更新（キー・バリューのペアを含む JSON ボディ） |
| `GET` | `/api/v1/settings/:key` | キーで特定の設定を取得 |

既知のキー: `disabledTools`（ツール ID の JSON 配列）, `enableExperimentalTools`（bool 文字列）, `loginAttemptLimit`（数値）。

## 環境設定 {#preferences}

ユーザーごとの環境設定は、インスタンス設定とは別です。認証済みユーザーは誰でも自分の環境設定マップを読み取り、更新できます。

| メソッド | パス | 説明 |
|--------|------|-------------|
| `GET` | `/api/v1/preferences` | 現在のユーザーの環境設定を `{ "preferences": { ... } }` として取得 |
| `PUT` | `/api/v1/preferences` | 現在のユーザーの 1 つ以上の環境設定キーをアップサート |

## ロール {#roles}

細分化されたパーミッションを持つカスタムロール管理。

| メソッド | パス | アクセス | 説明 |
|--------|------|--------|-------------|
| `GET` | `/api/v1/roles` | Admin（`audit:read`） | ユーザー数付きですべてのロールを一覧表示 |
| `POST` | `/api/v1/roles` | Admin（`security:manage`） | カスタムロールを作成（`name`, `description`, `permissions`） |
| `PUT` | `/api/v1/roles/:id` | Admin（`security:manage`） | カスタムロールを更新（組み込みロールは変更不可） |
| `DELETE` | `/api/v1/roles/:id` | Admin（`security:manage`） | カスタムロールを削除（組み込みロールは削除不可。影響を受けるユーザーは `user` ロールに戻る） |

利用可能なパーミッション（17）: `tools:use`, `files:own`, `files:all`, `apikeys:own`, `apikeys:all`, `pipelines:own`, `pipelines:all`, `settings:read`, `settings:write`, `users:manage`, `teams:manage`, `features:manage`, `system:health`, `audit:read`, `compliance:manage`, `webhooks:manage`, `security:manage`。

## 監査ログ {#audit-log}

セキュリティ関連のアクションを確認するための管理者専用エンドポイント。

| メソッド | パス | アクセス | 説明 |
|--------|------|--------|-------------|
| `GET` | `/api/v1/audit-log` | Admin（`audit:read`） | オプションのフィルタ付きのページネーションされた監査ログ |

クエリパラメータ:

| パラメータ | 説明 |
|-----------|-------------|
| `page` | ページ番号（デフォルト: 1） |
| `limit` | ページあたりのエントリ数（デフォルト: 50、最大: 100） |
| `action` | アクションタイプでフィルタ（例 `ROLE_CREATED`, `ROLE_DELETED`） |
| `ip` | ソース IP アドレスでフィルタ |
| `from` | この ISO 8601 日付より後のエントリでフィルタ |
| `to` | この ISO 8601 日付より前のエントリでフィルタ |

## アナリティクス {#analytics}

| メソッド | パス | アクセス | 説明 |
|--------|------|--------|-------------|
| `GET` | `/api/v1/config/analytics` | Public | 有効なアナリティクス設定（PostHog キー、Sentry DSN、サンプルレート）を取得。アナリティクスがオフの場合（コンパイル時のベイクまたはインスタンスの `analyticsEnabled` 設定のいずれか）、キー、DSN、インスタンス ID は空白になります。 |
| `POST` | `/api/v1/feedback` | Auth | 明示的なユーザーフィードバックを、設定された PostHog プロジェクトに `feedback_submitted` として送信。このルートはアナリティクスゲートを尊重し、送信をレート制限し、`contactOk` が true でない限り連絡先フィールドを取り除き、ファイルの内容、ファイル名、アップロードパス、生のプライベートエラーテキストを一切受け付けません。アナリティクスが無効な場合、`{ "ok": true, "accepted": false }` を返します。 |
| `PUT` | `/api/v1/settings` | Admin（`settings:write`） | インスタンス全体のオプトアウトを設定。全員のアナリティクスをオフにするには JSON ボディ `{ "analyticsEnabled": "false" }` を、再びオンにするには `"true"` を送信します。 |

## 機能 / AI バンドル {#features-ai-bundles}

AI 機能バンドル（Docker 環境での AI モデルパッケージのインストール/アンインストール）を管理します。カスタム自動化からツールを有効化する場合は、ツールレベルのインストールエンドポイントを推奨します。一部の AI ツールは複数の共有バンドルを必要とし、このエンドポイントはインストール済みのバンドルをスキップして、不足しているものだけをキューに入れます。

| メソッド | パス | アクセス | 説明 |
|--------|------|--------|-------------|
| `GET` | `/api/v1/features` | Auth | すべての機能バンドルとそのインストール状況を一覧表示 |
| `POST` | `/api/v1/admin/features/:bundleId/install` | Admin（`features:manage`） | 機能バンドルをインストール（非同期、進捗トラッキング用の `jobId` を返す） |
| `POST` | `/api/v1/admin/tools/:toolId/features/install` | Admin（`features:manage`） | ツールが必要とするすべてのバンドルをインストール。バンドルごとの queued/skipped ステータスを返す |
| `POST` | `/api/v1/admin/features/:bundleId/uninstall` | Admin（`features:manage`） | 機能バンドルをアンインストールし、モデルファイルをクリーンアップ |
| `GET` | `/api/v1/admin/features/disk-usage` | Admin（`features:manage`） | AI モデルの合計ディスク使用量を取得 |
| `POST` | `/api/v1/admin/features/import` | Admin（`features:manage`） | オフラインの AI バンドルアーカイブをインポート |

## 管理者操作 {#admin-operations}

オブザーバビリティ、サポート、使用状況レポート、バックアップステータスのための運用エンドポイント。

| メソッド | パス | アクセス | 説明 |
|--------|------|--------|-------------|
| `GET` | `/api/v1/admin/log-level` | Admin（`settings:write`） | 現在のランタイムログレベルを読み取る |
| `POST` | `/api/v1/admin/log-level` | Admin（`settings:write`） | ランタイムログレベルを変更（`fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent` のいずれか） |
| `GET` | `/api/v1/metrics` | Admin（`system:health`） | テキスト形式の Prometheus メトリクス |
| `GET` | `/api/v1/admin/support-bundle` | Admin（`system:health`） | 秘匿化された診断サポートバンドル ZIP をダウンロード |
| `GET` | `/api/v1/admin/usage` | Admin（`audit:read`） | 使用状況ダッシュボードデータ（オプションの `days` クエリパラメータ付き） |
| `GET` | `/api/v1/admin/backup-status` | Admin（`system:health`） | 最新のバックアップメタデータと鮮度ステータスを読み取る |
| `POST` | `/api/v1/admin/backup-status` | Admin（`system:health`） | 完了したバックアップを記録（`type`, オプションの `sizeBytes`, オプションの `notes`） |

## エンタープライズ API {#enterprise-apis}

これらのルートは、関連するエンタープライズ機能によってライセンスゲートされています。それでも、記載された SnapOtter のパーミッションを必要とします。

| メソッド | パス | アクセス | 説明 |
|--------|------|--------|-------------|
| `GET` | `/api/v1/enterprise/audit/export` | Admin（`audit:read`） | 監査エントリをフィルタ付きで JSON または CSV としてエクスポート |
| `GET` | `/api/v1/enterprise/config/export` | Admin（`system:health`） | 秘匿化されたインスタンス設定、カスタムロール、チームをエクスポート |
| `POST` | `/api/v1/enterprise/config/import` | Admin（`system:health`） | 設定をインポート（オプションのドライラン付き） |
| `GET` | `/api/v1/enterprise/ip-allowlist` | Admin（`security:manage`） | 設定された CIDR 許可リストを読み取る |
| `PUT` | `/api/v1/enterprise/ip-allowlist` | Admin（`security:manage`） | 自己ロックアウト防止付きで CIDR 許可リストを更新 |
| `GET` | `/api/v1/enterprise/legal-hold` | Admin（`compliance:manage`） | ユーザーおよびチームのリーガルホールドを一覧表示 |
| `PUT` | `/api/v1/enterprise/legal-hold` | Admin（`compliance:manage`） | ユーザーまたはチームにリーガルホールドを適用または解除 |
| `POST` | `/api/v1/enterprise/scim/token` | Admin（`users:manage`） | SCIM ベアラートークンを生成（一度だけ返される） |
| `DELETE` | `/api/v1/enterprise/scim/token` | Admin（`users:manage`） | 現在の SCIM ベアラートークンを失効 |
| `GET` | `/api/v1/enterprise/siem/config` | Admin（`webhooks:manage`） | SIEM 転送設定を読み取る |
| `PUT` | `/api/v1/enterprise/siem/config` | Admin（`webhooks:manage`） | SIEM 転送設定を更新 |
| `GET` | `/api/v1/enterprise/webhooks` | Admin（`webhooks:manage`） | Webhook の宛先を一覧表示 |
| `POST` | `/api/v1/enterprise/webhooks` | Admin（`webhooks:manage`） | Webhook の宛先を作成 |
| `PUT` | `/api/v1/enterprise/webhooks/:index` | Admin（`webhooks:manage`） | Webhook の宛先を更新 |
| `DELETE` | `/api/v1/enterprise/webhooks/:index` | Admin（`webhooks:manage`） | Webhook の宛先を削除 |
| `POST` | `/api/v1/enterprise/webhooks/:index/test` | Admin（`webhooks:manage`） | テスト用の Webhook ペイロードを送信 |
| `POST` | `/api/v1/enterprise/users/:id/export` | Admin（`compliance:manage`） | GDPR ユーザーエクスポートジョブを開始 |
| `GET` | `/api/v1/enterprise/users/:id/export/:jobId` | Admin（`compliance:manage`） | GDPR エクスポートのステータスとダウンロード URL を読み取る |
| `DELETE` | `/api/v1/enterprise/users/:id/purge` | Admin（`compliance:manage`） | 確認後にユーザーのデータを完全に消去 |
| `DELETE` | `/api/v1/enterprise/teams/:id/purge` | Admin（`compliance:manage`） | 確認後にチームのデータを完全に消去 |
| `GET` | `/api/v1/admin/version` | Admin（`system:health`） | アプリ、ビルド、Node、スキーマのバージョンメタデータを読み取る |
| `GET` | `/api/v1/admin/migrations/pending` | Admin（`system:health`） | パッケージされたマイグレーションと適用済みマイグレーションを比較 |
| `GET` | `/api/v1/admin/upgrade-check` | Admin（`system:health`） | アップグレードのレディネスチェックを実行 |

### SCIM 2.0 {#scim-2-0}

SCIM のディスカバリエンドポイントは公開されています。ユーザーおよびグループのエンドポイントには、上で生成した SCIM ベアラートークンが必要です。

| メソッド | パス | アクセス | 説明 |
|--------|------|--------|-------------|
| `GET` | `/api/v1/scim/v2/ServiceProviderConfig` | Public | SCIM サーバーの機能 |
| `GET` | `/api/v1/scim/v2/Schemas` | Public | SCIM スキーマのディスカバリ |
| `GET` | `/api/v1/scim/v2/ResourceTypes` | Public | SCIM リソースタイプのディスカバリ |
| `GET` | `/api/v1/scim/v2/Users` | SCIM token | ユーザーを一覧表示（オプションの SCIM フィルタ付き） |
| `POST` | `/api/v1/scim/v2/Users` | SCIM token | ユーザーを作成 |
| `GET` | `/api/v1/scim/v2/Users/:id` | SCIM token | ユーザーを取得 |
| `PUT` | `/api/v1/scim/v2/Users/:id` | SCIM token | ユーザーを置換 |
| `DELETE` | `/api/v1/scim/v2/Users/:id` | SCIM token | ユーザーをソフト無効化 |
| `GET` | `/api/v1/scim/v2/Groups` | SCIM token | チームを SCIM グループとして一覧表示 |
| `POST` | `/api/v1/scim/v2/Groups` | SCIM token | チームを作成 |
| `GET` | `/api/v1/scim/v2/Groups/:id` | SCIM token | チームを取得 |
| `PUT` | `/api/v1/scim/v2/Groups/:id` | SCIM token | チームとグループメンバーシップを置換 |
| `DELETE` | `/api/v1/scim/v2/Groups/:id` | SCIM token | チームを削除 |

## ミームテンプレート {#meme-templates}

ミームジェネレーターツールをサポートする API。

| メソッド | パス | アクセス | 説明 |
|--------|------|--------|-------------|
| `GET` | `/api/v1/meme-templates` | Auth | テキストボックスの位置を含むすべての利用可能なミームテンプレートを一覧表示 |
| `GET` | `/api/v1/meme-templates/full/:filename` | Auth | フルサイズのテンプレート画像を配信 |
| `GET` | `/api/v1/meme-templates/thumbs/:filename` | Auth | テンプレートのサムネイルを配信 |
| `GET` | `/api/v1/meme-templates/fonts/:filename` | Auth | ミームテキストのレンダリングに使用されるフォントファイルを配信 |

## エラーレスポンス {#error-responses}

すべてのエラーは JSON を返します:

```json
{
  "error": "Human-readable message",
  "code": "MACHINE_READABLE_CODE"
}
```

| ステータス | 意味 |
|--------|---------|
| 400 | 無効なリクエスト / 検証失敗 |
| 401 | 未認証 |
| 403 | パーミッション不足 |
| 404 | リソースが見つからない |
| 413 | ファイルが大きすぎる（`MAX_UPLOAD_SIZE_MB` を参照） |
| 422 | 検証後に処理が失敗 |
| 429 | レート制限（`RATE_LIMIT_PER_MIN` を参照） |
| 501 | 必要な AI 機能バンドルがインストールされていない（`FEATURE_NOT_INSTALLED`） |
| 500 | 内部サーバーエラー |
