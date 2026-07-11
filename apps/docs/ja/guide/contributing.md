---
description: "SnapOtter への貢献方法。バグ報告、機能リクエスト、プルリクエスト、CLA の要件について。"
i18n_source_hash: 528802503035
i18n_provenance: human
i18n_output_hash: f22f41277ff7
---

# 貢献する {#contributing}

貢献に関心を持っていただきありがとうございます。このガイドでは、参加方法、受け付ける内容、そして始め方について説明します。

## 貢献の方法 {#ways-to-contribute}

### Issue（セットアップ不要） {#issues-no-setup-required}

- **バグ報告** - 何か壊れていますか？再現手順を添えて [バグ報告](https://github.com/snapotter-hq/snapotter/issues/new?template=bug_report.yml) を作成してください。
- **機能リクエスト** - アイデアがありますか？[ディスカッション](https://github.com/snapotter-hq/snapotter/discussions/new?category=ideas) を始めれば、コミュニティが意見を出したり賛成票を投じたりできます。
- **翻訳の問題** - 誤った翻訳や欠落した翻訳を見つけましたか？[翻訳の Issue](https://github.com/snapotter-hq/snapotter/issues/new?template=translation.yml) を作成してください。
- **ドキュメントの問題** - ドキュメントに問題がありますか？[ドキュメントの Issue](https://github.com/snapotter-hq/snapotter/issues/new?template=documentation.yml) を作成してください。

### コード（CLA が必要） {#code-requires-cla}

以下のプルリクエストを受け付けています。

| 種類 | プロセス |
|------|---------|
| バグ修正 | そのまま PR を作成（該当する Issue があればリンク） |
| 新しい翻訳 | そのまま PR を作成（[翻訳ガイド](/ja/guide/translations) を参照） |
| ドキュメントの改善 | そのまま PR を作成 |
| テストカバレッジの改善 | そのまま PR を作成 |
| 新しいツールや機能 | まず [ディスカッション](https://github.com/snapotter-hq/snapotter/discussions/new?category=ideas) を始めます。承認されたアイデアは、コードを書く前にメンテナが追跡用の Issue に変換します |
| リファクタリングやアーキテクチャの変更 | まず [ディスカッション](https://github.com/snapotter-hq/snapotter/discussions/new?category=ideas) を始め、コードを書く前にメンテナの承認を待ちます |

### 受け付けないもの {#what-we-will-not-accept}

- CI/CD ワークフロー、リリース設定、リンター/コンパイラ設定への変更
- 署名済みの [コントリビューターライセンス契約](#contributor-license-agreement) がない PR
- 変更が 400 行を超える PR（大きな作業は小さな PR に分割してください）
- 事前に議論・承認されていない機能
- 事前の議論なしの `packages/ai/` への変更

## コントリビューターライセンス契約 {#contributor-license-agreement}

最初の PR をマージする前に、[個人向け CLA](https://github.com/snapotter-hq/snapotter/blob/main/CLA.md) に署名していただく必要があります。これは一度きりの要件です。

**理由:** SnapOtter はデュアルライセンス（AGPLv3 + 商用）です。CLA は、あなたの貢献を両方のライセンスで配布する権利を当社に付与します。あなたは自分の作業に対する著作権を完全に保持します。

**方法:** 最初の PR を作成すると、CLA Assistant ボットがリンク付きのコメントを投稿します。そのリンクをクリックし、契約内容を確認して、GitHub アカウントで署名してください。30 秒で完了します。

雇用主のために貢献しており、雇用主があなたの作業の IP 権利を保持している場合は、送信前に contact@snapotter.com までご連絡いただき、法人向け CLA を手配してください。

## 始め方 {#getting-started}

### 前提条件 {#prerequisites}

- Node.js 22 以上
- pnpm 9 以上
- Python 3.11 以上（AI ツールのみ）
- Docker（オプション、完全な統合テスト用）

### セットアップ {#setup}

```bash
# Fork and clone
git clone https://github.com/<your-username>/snapotter.git
cd snapotter

# Start Postgres + Redis for local dev
docker compose -f docker-compose.dev.yml up -d

# Install dependencies
pnpm install

# Start dev servers (web on :1349, API on :13490)
pnpm dev
```

### チェックの実行 {#running-checks}

PR を送信する前に、すべてのチェックがローカルで通ることを確認してください。

```bash
pnpm lint          # Biome lint + format check
pnpm typecheck     # TypeScript across monorepo
pnpm test          # Vitest unit + integration tests
```

## プルリクエストのプロセス {#pull-request-process}

1. リポジトリをフォークし、`main`（`feat/my-feature` または `fix/issue-123`）からブランチを作成します
2. [Conventional Commits](https://www.conventionalcommits.org/) を使って、焦点を絞ったレビューしやすいコミットで変更を加えます
3. 変更に対するテストを追加または更新します
4. ローカルで `pnpm lint && pnpm typecheck && pnpm test` を実行します
5. `main` に対して PR を作成し、テンプレートを記入します
6. 求められたら CLA に署名します
7. CI が通り、メンテナがレビューするのを待ちます

### レビューについての期待 {#review-expectations}

- PR には 7 日以内に応答することを目指しています
- 小さく焦点を絞った PR ほど早くレビューされます
- 7 日経っても返事がない場合は、スレッドに一言コメントしてください
- 変更を依頼したり、別のアプローチを提案したり、プロジェクトの方向性に沿わない場合は PR をクローズしたりすることがあります

### PR がマージされた後 {#after-your-pr-is-merged}

あなたの貢献は次のリリースに含まれ、変更履歴にクレジットされます。

## Good first issue {#good-first-issues}

取り組めるものを探していますか？初心者向けのタスクは [good first issues](https://github.com/snapotter-hq/snapotter/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) を、コミュニティの協力を歓迎するより大きな項目は [help wanted](https://github.com/snapotter-hq/snapotter/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22) を確認してください。

## コードスタイル {#code-style}

- Biome がフォーマットとリントを担当します（ダブルクォート、セミコロン、2 スペースインデント）
- pre-commit フックがステージされたファイルに対して `biome check --write` を自動的に実行します
- リンターが警告した場合は、コードを修正してください（Biome の設定は変更しないでください）
- すべての場所で ES モジュール（`import`/`export`）
- Conventional Commits: `feat:`、`fix:`、`refactor:`、`docs:`、`test:`、`chore:`

アーキテクチャの詳細については、[開発者ガイド](/ja/guide/developer) を参照してください。

## セキュリティ {#security}

**セキュリティ脆弱性については、公開の PR や Issue を作成しないでください。** [GitHub Security Advisories](https://github.com/snapotter-hq/snapotter/security/advisories/new) を通じて非公開で報告するか、contact@snapotter.com までメールしてください。詳細は [SECURITY.md](https://github.com/snapotter-hq/snapotter/blob/main/SECURITY.md) を参照してください。

## 質問がありますか？ {#questions}

- [ドキュメント](https://docs.snapotter.com/)
- [Discord](https://discord.gg/hr3s7HPUsr)
- [GitHub Discussions](https://github.com/snapotter-hq/snapotter/discussions)
