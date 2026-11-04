# Minus One Recon — MVP設計

## 目的と範囲

案件ごとの攻撃対象面を蓄積し、観測の変化と研究者の仮説を診断につなぐ独立アプリ。MVPの完了は、プロジェクト作成からScope設定、結果取り込み、資産探索、過去比較、調査メモ保存まで一連で実行できること。現在の成果物はそのUIプロトタイプであり、本書の本番要件すべてを実装したものではない。

## 1. 画面一覧

|画面|主な情報・操作|優先度|
|---|---|---|
|Projects|作成、案件選択、期間、状態、Pentest案件参照|P0|
|Dashboard|KPI、優先資産、簡易グラフ、ジョブ、差分、仮説、Scope|P0|
|Assets|全資産、検索、種類・生存・Risk・タグの絞り込み、詳細|P0|
|Subdomains|FQDN、DNSレコード、解決先、生存、露出、観測元|P0|
|Services / Ports|資産、port、transport、protocol、banner、TLS、Risk|P0|
|Technologies|製品、種別、version、根拠、confidence、利用資産、変更|P0|
|Jobs|状態、対象、profile、tool、開始/終了、結果、エラー、取り込み元|P0|
|Diffs|比較元/先snapshot、新規/消失/変更、資産へのリンク|P0|
|Notes|仮説、調査メモ、要検証、関連資産、Finding候補、履歴|P0|
|Project settings / Scope|包含/除外、domain/IP/CIDR、許可期間、承認根拠|P0|
|Import|CSV/JSON、フィールド対応、検証プレビュー、重複/Scope判定、確定|P1|

P0は必須。P1も本番MVPの完成条件に含める。Importは自動ツール連携より先に実装し、手動結果から価値を提供する。

## 2. 情報設計

すべてのページをProjectの下に置く。Project切替で検索、フィルタ、詳細、比較対象をリセットし、別案件の情報混在を防ぐ。URLは `/projects/:projectId/{overview,assets,subdomains,services,technologies,jobs,diffs,notes,settings}`。一覧状態はクエリ文字列に保持し、ブラウザの戻る操作と共有を可能にする。

概要の上段で規模と危険箇所、中央で資産とつながり、下段で最近の実行・変化・仮説を読む。Scopeは常に参照可能にする。Riskは調査優先度であり、確認済み脆弱性のseverityとは別概念。Critical Exposuresは根拠を持つ未解消ExposureのCritical件数として定義し、資産数と混同しない。

Asset詳細は基本情報 → Scope判定 → サービス → 技術 → 観測履歴 → メモ。DNS情報はSubdomain詳細、TLSとbannerはService詳細へ。観測元・時刻・根拠を必ず追跡できる。未観測を即「消失」とせず、スキャンの成功・対象範囲・完全性を考慮する。

検索対象はhost/IP、tag、技術、メモ。フィルタはAND条件、複数タグ内はORを基本とし表示上明示する。空・読込・失敗・権限なし・結果なしを別状態として扱う。

## 3. データモデル

IDはUUID、時刻はUTC。案件データはproject_id必須。関連付け時にも同一Projectであることを検証する。

|モデル|主要フィールド・関係|
|---|---|
|Project|id, organization_id, name, root_domain, status, starts_at, ends_at, external_pentest_project_id|
|Scope|id, project_id, kind(domain/ip/cidr), value, disposition(include/exclude), authorized_from/to, authorization_ref|
|Asset|id, project_id, kind(host/ip), canonical_value, status, risk, risk_reason, first_seen_at, last_seen_at, scope_state|
|Subdomain|asset_id, parent_domain, fqdn。host Assetの詳細として1:1|
|DNSRecord|id, asset_id, type, value, ttl, observed_at, observation_id|
|Service|id, project_id, asset_id, port, transport, protocol, banner, tls_metadata, status, risk|
|Technology|id, name, category, vendor|
|TechnologyDetection|id, project_id, asset_id, service_id?, technology_id, version, confidence, evidence, observation_id|
|Job|id, project_id, profile, status(queued/running/completed/failed/cancelled), target_scope_ids, started_at, finished_at, error|
|JobToolRun|id, job_id, tool, tool_version, arguments_redacted, status, output_ref, error|
|ImportBatch|id, project_id, job_id, file_hash, format, status, rows_total/accepted/rejected, error_report_ref|
|Snapshot|id, project_id, job_id, captured_at, coverage, completeness, status|
|Observation|id, project_id, snapshot_id, asset_id, service_id?, source, observed_at, evidence_ref, normalized_payload|
|Diff|id, project_id, from_snapshot_id, to_snapshot_id, entity_type/id, kind(added/removed/changed), before, after|
|Note|id, project_id, title, body, kind(hypothesis/research/verification), status(open/investigating/resolved/candidate), author_id, created_at, updated_at|
|NoteEntityLink|note_id, entity_type, entity_id。資産、サービス、差分、観測を関連付け|
|Tag / AssetTag|Tag(id,project_id,name), AssetTag(asset_id,tag_id)|
|Exposure|id, project_id, asset_id, service_id?, risk, status, evidence_ref, source_observation_id|
|FindingPromotion|id, project_id, note_id?, exposure_id?, status(candidate/pending/sent/failed), external_finding_id?, idempotency_key, payload_version, error|

一意制約はAsset(project_id,kind,canonical_value)、Service(asset_id,port,transport)、Tag(project_id,name)。FQDNは小文字・末尾ドット除去、IPは正規化する。資産の現在値と不変のObservationを分ける。Snapshotは完了した観測セットを保持し、Diffは互換性のある対象範囲同士から生成する。部分失敗のジョブは消失判定から除外する。

Scopeは除外を優先。ワイルドカードdomainはラベル境界で照合し、CIDRは数値判定する。取り込み時に範囲外データを識別し、自動実行対象に含めない。

Findingへの昇格は、候補化 → 内容と根拠のレビュー → 明示的送信 → 外部ID保存。再送にはidempotency_keyを使い二重登録を防ぐ。Reconの未検証仮説を確定Findingとして自動送信しない。MVPでは候補と関連証拠の保存まで、外部API接続は将来対応。

## 4. UIコンポーネント

現在の共通部品はPanel、Badge、Sparkline、Modal、TextLink。アプリシェルはSidebar、Topbar、ProjectSelector、GlobalSearch、PageHeaderへ分割できる構成。ダッシュボードのパネルも独立部品へ切り出す。

本番向けの追加部品はMetricCard、AssetTable、FilterBar、TagInput、RiskBadge、StatusBadge、AssetDetailDrawer、DNSRecordTable、ServiceTable、TLSDetails、TechnologyBar、SubdomainGraph/List、JobStatus、JobLog、SnapshotSelector、DiffRow、NoteEditor、EntityPicker、FindingPromotionDialog、ScopeRuleEditor、ImportWizard、Pagination、EmptyState、ErrorState、Skeleton、Toast、ConfirmDialog。

広い画面では6 KPI、資産/地図の2列、ジョブ/技術/差分の3列。タブレットは3 KPI列と縮小サイドバー、モバイルは縦積み。資産テーブルだけ横スクロールを許可する。リスクは色だけで区別せず文字ラベルを併記。フォームにはラベル、キーボード操作、フォーカス管理を持たせる。

## 5. MVP優先順位と受入条件

1. **P0 基盤**: Project作成・選択、Scope包含/除外、永続DB、認証と案件境界。再読込後に保持され、別案件のIDで参照・更新できない。
2. **P0 Inventory**: Asset/Subdomain/DNS/Service/Technology CRUD、検索・フィルタ・タグ・Risk。正規化と一意制約が効き、詳細から根拠を参照できる。
3. **P1 Import**: CSV/JSONの検証プレビュー、行別エラー、確定、重複処理、ロールバック可能なバッチ単位。引用符・UTF-8・不正列・重複・範囲外を扱う。
4. **P0 記録と比較**: Jobs、tool結果への参照、完了snapshot、Diff。比較対象を選べ、部分失敗を消失と誤認しない。手動ImportもJobとして記録する。
5. **P0 調査**: Notesの保存・編集・関連付け、Finding候補化。対象資産と根拠を失わずに追跡できる。
6. **P0 Overview**: 実データ集計、前回成功snapshotとの比較、危険資産と最近の差分への遷移。固定サンプル値を本番集計に置き換える。
7. **将来**: Nmap/httpx/subfinder/naabu/nuclei用adapterとworker、外部Findings送信、チーム権限、通知、レポート、外部API。リアルタイム共同編集・高度グラフ・大量SaaS連携は後回し。

ツール実行をUIプロセスから分離し、Job Queue → Worker → normalized Observation → Snapshot → Diffのパイプラインで増設する。現在は実スキャンを実行しない。

## 統合方針

既存の認証・案件モデルを確認し、ホーム・Pentest・Reconを単一アプリへ組み込んだ。既存のチーム共通members + MFA + RLSを再利用する。詳細と未適用事項は [統合手順](UNIFIED-DEPLOYMENT.md) を参照。
