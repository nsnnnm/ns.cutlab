# CutLab — ブラウザネイティブ動画エディタ

FFmpeg.wasm を使ったブラウザ完結の動画編集サイトです。  
GitHub + Cloudflare Pages/Workers でゼロコストデプロイ対応。

## 機能

| 機能 | 説明 |
|------|------|
| ✂ カット/トリミング | タイムライン上でIN/OUTをドラッグ設定 |
| T テキスト/字幕 | 位置・フォントサイズ・色・表示時間を設定 |
| ◑ フィルター | 明るさ/コントラスト/彩度/ブラー + 8種プリセット |
| ♪ 音声 | ミュート・音量調整 |
| ⚙ エクスポート | MP4 (H.264 + AAC) でダウンロード |

## アーキテクチャ

```
ブラウザ (React + Vite)
  └── FFmpeg.wasm ← 動画処理はすべてローカル (サーバー不要)
  └── Cloudflare Pages ← ホスティング

Cloudflare Worker (オプション)
  └── R2 Bucket ← 動画ファイルの保存
  └── KV ← ジョブメタデータ
```

> **重要**: FFmpeg の動画エンコードは Workers の CPU 制限に収まらないため、  
> 処理はすべてブラウザの WebAssembly で行います。  
> Workers は R2 へのゲートウェイとして使います。

---

## セットアップ

### 必要なもの

- Node.js 18+
- Cloudflare アカウント (無料プランでOK)
- GitHub アカウント

### ローカル開発

```bash
# 依存関係インストール
npm install

# 開発サーバー起動
npm run dev
# → http://localhost:5173
```

### Cloudflare へのデプロイ

#### 1. GitHub Secrets の設定

GitHubリポジトリの `Settings > Secrets and variables > Actions` に追加:

| Secret名 | 取得場所 |
|----------|----------|
| `CLOUDFLARE_API_TOKEN` | [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens) → API Tokens → Edit Cloudflare Workers |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Dashboard → 右サイドバーのアカウントID |

#### 2. Cloudflare Pages プロジェクト作成

```bash
# Wrangler をインストール
npm install -g wrangler
wrangler login

# Pages プロジェクトを作成 (初回のみ)
wrangler pages project create cutlab
```

#### 3. Workers + R2 のセットアップ (オプション)

```bash
# R2 バケット作成
wrangler r2 bucket create cutlab-videos

# KV Namespace 作成
wrangler kv:namespace create JOB_KV
# → 出力された ID を wrangler.toml の YOUR_KV_NAMESPACE_ID に貼り付け

# Worker をデプロイ
wrangler deploy
```

#### 4. GitHub へ push するだけで自動デプロイ

```bash
git add .
git commit -m "Initial deployment"
git push origin main
```

GitHub Actions が自動的に:
1. `npm run build` でビルド
2. Cloudflare Pages にデプロイ
3. Cloudflare Worker をデプロイ

---

## CORS / SharedArrayBuffer について

FFmpeg.wasm は `SharedArrayBuffer` を必要とするため、以下のヘッダーが必要です:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Cloudflare Pages では `dist/_headers` で自動設定されます (CI/CDで生成)。

---

## ファイル構成

```
video-editor/
├── src/
│   ├── App.jsx                 # メインエディタ UI
│   ├── components/
│   │   ├── VideoPlayer.jsx     # 動画プレイヤー + タイムライン
│   │   ├── TextPanel.jsx       # テキスト/字幕設定
│   │   ├── FiltersPanel.jsx    # フィルター設定
│   │   ├── AudioPanel.jsx      # 音声設定
│   │   └── ExportPanel.jsx     # エクスポート
│   └── hooks/
│       └── useFFmpeg.js        # FFmpeg.wasm 制御
├── worker/
│   └── index.js                # Cloudflare Worker
├── .github/workflows/
│   └── deploy.yml              # GitHub Actions
├── wrangler.toml               # Worker 設定
└── vite.config.js              # Vite 設定 (COOP/COEP ヘッダー)
```

## ライセンス

MIT
