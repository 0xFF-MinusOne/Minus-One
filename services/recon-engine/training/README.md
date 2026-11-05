# JAXによるモデル改善（オプション）

推論用API・Workerとは別のオフライン工程。`pip install -e '.[ml]'` でJAX/Flax/Optaxを導入する。既存OSSの検出アルゴリズムは置き換えない。

初期用途は、レビュー済みFingerprintの信頼度やCVE候補の優先順位の学習。IPAの組織評価スコアを、脆弱性の正解ラベルとして利用しない。APIサブスクリプションモデルの重みは更新できない。

学習データは明示的な利用許可と人手レビューがあるものだけ。Project単位で学習・検証・テストを分離し、同じ案件や重複証跡によるリークを防ぐ。重み・学習元ハッシュ・コードcommit・乱数seed・検証指標をセットで保存する。モデルの推測は常に推定として扱い、Scope/権限/承認を変更できない。

GPU依存を本番のWeb・Workerに追加しない。現段階では実学習を行っておらず、学習済みモデルは含まない。

参照: https://docs.jax.dev/ / https://flax.readthedocs.io/ / https://optax.readthedocs.io/
