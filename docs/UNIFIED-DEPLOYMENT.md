# Minus Oneを1つのVercel・Supabaseへまとめる

## 統合先

- Vercel: kuras-projects-04f00ed7 / minus-one
- Supabase: vgkgytpqdfwwddjvtknu
- ホーム側リポジトリ: 0xFF-MinusOne/Minus-One
- Pentestの移植元: 0xFF-MinusOne/pentest-dashboard

## この変更の範囲

ホーム、Pentest、Reconを1つのReactアプリへ組み込み、1回のVercelビルドで配信する。

|URL|用途|認証|
|---|---|---|
|/|既存ホーム、アプリ一覧|公開|
|/pentest|既存Pentestの概要|既存Supabaseログイン・MFA・メンバー確認|
|/recon|日本語のRecon UIプレビュー|同上|
|/projects、/findings等|既存の案件・検出事項管理|同上|
|/login、/mfa|共通認証|既存実装|

既存の案件・FindingsのURLは保持。ログイン後の既定遷移先は /pentest。Reconから既存案件一覧を同じクライアント・キャッシュで取得する。CSSはRecon配下へ限定し、既存ホームとPentestへ影響させない。外部フォント読込を除去して既存CSPに合わせた。

Reconの観測・メモ・KPI・ジョブはまだサンプル。案件を選択しても実データとして表示しないよう明示している。ReconのDBテーブル作成や既存データの移行・削除はこの変更に含めない。Findings昇格は現在候補へのマークまで。

## 適用前確認

1. Vercel minus-one がGitHub Minus-Oneへ接続されていること、現在のProduction Branchを確認する。
2. Preview環境へ既存Pentestと同じ `VITE_SUPABASE_URL` と `VITE_SUPABASE_ANON_KEY` を設定。URLは https://vgkgytpqdfwwddjvtknu.supabase.co。キーは既存設定から安全に移す。secret/service_roleは設定しない。
3. 既存SupabaseにPentestの projects / members / findings とRLS・MFA設定が適用されていることを確認。supabase/migrationsは移植元の既存履歴なので、稼働済みDBに初期マイグレーションを手動再実行しない。履歴と実スキーマを比較する。
4. Supabase Authで統合ドメインが認可済みURLに含まれることを確認する。
5. Previewでホーム、ログイン、MFA、既存案件・Findingsの読み書き、Reconの表示と案件選択、ログアウトを検証する。
6. 合格後に既存minus-oneへ本番反映。旧PentestのVercel・リポジトリは、データ・接続・リンク確認が終わるまで削除しない。

Supabase AuthとDBは既存のものをそのまま使うため、新規プロジェクトは作成しない。旧Pentest環境を廃止する前に移行後の動作確認が必要。

## この作業環境の検証限界

型チェック、production build、既存テストと統合テストで検証する。ポート待ち受けはEPERMで拒否されるためブラウザ確認は未実施。Vercel CLIはfetch failed、Supabase CLIはアクセストークン未設定のため、実プロジェクト設定の取得・本番デプロイ・DB接続確認は未実施。

ローカル起動は `npm ci` の後 `npm run dev`。http://127.0.0.1:8092 を開く。Supabase環境変数未設定でも公開ホームは表示できるが、認証が必要なページは設定が必要。
