import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, FileJson } from 'lucide-react';
import { useState, type ChangeEvent } from 'react';
import { importTrivyItems, listTrivyKeys, type ImportOutcome } from '../api/findings';
import { useRefreshData } from '../api/queries';
import { SEVERITIES, SEVERITY_LABELS, type Project } from '../lib/domain';
import { errorMessage } from '../lib/errors';
import {
  MAX_TRIVY_FILE_BYTES,
  readTrivyFile,
  trivyItemKey,
  TrivyParseError,
  type TrivyParseResult,
} from '../lib/trivy';
import { Button, ErrorNote, Modal } from './ui';

interface Preview {
  fileName: string;
  result: TrivyParseResult;
  newCount: number;
  existingCount: number;
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-line px-3 py-2.5">
      <dt className="whitespace-nowrap text-xs text-ink-soft">{label}</dt>
      <dd className="mt-0.5 text-xl font-bold tabular-nums">{value.toLocaleString('ja-JP')}</dd>
    </div>
  );
}

export function TrivyImportDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const refresh = useRefreshData();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // 同じファイルを選び直しても change が起きるように空にする。
    event.target.value = '';
    if (!file) return;
    setReading(true);
    setReadError(null);
    setPreview(null);
    try {
      const result = await readTrivyFile(file);
      const existing = await listTrivyKeys(project.id);
      const existingCount = result.items.filter((item) => existing.has(trivyItemKey(item))).length;
      setPreview({
        fileName: file.name,
        result,
        existingCount,
        newCount: result.items.length - existingCount,
      });
    } catch (error) {
      setReadError(error instanceof TrivyParseError ? error.message : errorMessage(error));
    } finally {
      setReading(false);
    }
  };

  const save = useMutation({
    mutationFn: async (current: Preview) => importTrivyItems(project.id, current.result.items),
    onSuccess: async (result) => {
      setOutcome(result);
      await refresh();
    },
  });

  // 結果の「スキップ」には、変更なしに加えて保存前に省いた分も含める。
  const leftOut = preview ? preview.result.summary.duplicates + preview.result.summary.invalid : 0;

  return (
    <Modal title="Trivy の結果を取り込む" onClose={onClose} wide>
      <div className="space-y-4 text-sm">
        {outcome && preview ? (
          <>
            <p className="flex items-center gap-2 font-semibold text-[#17663B]">
              <CheckCircle2 className="h-5 w-5" aria-hidden />
              取り込みが完了しました。
            </p>
            <dl className="grid grid-cols-3 gap-2">
              <Stat label="新規" value={outcome.inserted} />
              <Stat label="更新" value={outcome.updated} />
              <Stat label="スキップ" value={outcome.skipped + leftOut} />
            </dl>
            <p className="text-xs text-ink-muted">
              スキップの内訳: 変更なし {outcome.skipped.toLocaleString('ja-JP')} 件、ファイル内の重複{' '}
              {preview.result.summary.duplicates.toLocaleString('ja-JP')} 件、ID などの不足{' '}
              {preview.result.summary.invalid.toLocaleString('ja-JP')} 件。
            </p>
            <div className="flex justify-end">
              <Button variant="primary" onClick={onClose}>
                閉じる
              </Button>
            </div>
          </>
        ) : (
          <>
            <div>
              <p className="text-ink-soft">
                <code className="font-mono text-xs">trivy fs --format json</code> の JSON ファイルを選んでください（上限{' '}
                {MAX_TRIVY_FILE_BYTES / 1024 / 1024}MB）。保存を押すまで登録されません。
              </p>
              <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-white px-3.5 py-2 font-semibold hover:bg-canvas focus-within:outline focus-within:outline-2 focus-within:outline-brand-600">
                <FileJson className="h-4 w-4" aria-hidden />
                {reading ? '読み込み中…' : 'ファイルを選ぶ'}
                <input
                  type="file"
                  accept=".json,application/json"
                  className="sr-only"
                  disabled={reading || save.isPending}
                  onChange={(event) => void onFile(event)}
                />
              </label>
            </div>

            {readError ? <ErrorNote>{readError}</ErrorNote> : null}

            {preview ? (
              <div className="space-y-4 border-t border-line pt-4">
                <p className="font-semibold [overflow-wrap:anywhere]">
                  取り込み内容の確認: <span className="font-mono text-xs">{preview.fileName}</span>
                </p>
                <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Stat label="登録対象" value={preview.result.items.length} />
                  <Stat label="新規の見込み" value={preview.newCount} />
                  <Stat label="登録済みと一致" value={preview.existingCount} />
                  <Stat label="脆弱性 / 設定不備" value={preview.result.summary.vulnerabilities + preview.result.summary.misconfigurations} />
                </dl>
                <ul className="flex flex-wrap gap-x-4 gap-y-1 text-ink-soft">
                  {SEVERITIES.map((severity) => (
                    <li key={severity}>
                      {SEVERITY_LABELS[severity]}:{' '}
                      <span className="font-semibold tabular-nums text-ink">
                        {preview.result.items
                          .filter((item) => item.severity === severity)
                          .length.toLocaleString('ja-JP')}
                      </span>
                    </li>
                  ))}
                </ul>
                <ul className="list-disc space-y-1 pl-5 text-xs text-ink-soft">
                  <li>脆弱性 {preview.result.summary.vulnerabilities.toLocaleString('ja-JP')} 件、設定不備（FAIL）{preview.result.summary.misconfigurations.toLocaleString('ja-JP')} 件</li>
                  <li>FAIL 以外で除外: {preview.result.summary.excludedNonFail.toLocaleString('ja-JP')} 件</li>
                  <li>ファイル内の重複: {preview.result.summary.duplicates.toLocaleString('ja-JP')} 件</li>
                  <li>ID などが足りず除外: {preview.result.summary.invalid.toLocaleString('ja-JP')} 件</li>
                  {preview.result.summary.secretsIgnored > 0 ? (
                    <li>
                      シークレットの検出 {preview.result.summary.secretsIgnored.toLocaleString('ja-JP')} 件は取り込みません。Trivy の出力を直接確認してください。
                    </li>
                  ) : null}
                  <li>登録済みと一致した項目は、内容に差があれば更新します。ステータス・検証状況・報告状況は変更しません。</li>
                </ul>
                {preview.result.items.length === 0 ? (
                  <p className="text-ink-soft">取り込める検出事項はありませんでした。</p>
                ) : null}
                {save.error ? <ErrorNote>{errorMessage(save.error)}（何も保存されていません）</ErrorNote> : null}
              </div>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button onClick={onClose} disabled={save.isPending}>
                キャンセル
              </Button>
              <Button
                variant="primary"
                disabled={!preview || preview.result.items.length === 0}
                loading={save.isPending}
                onClick={() => preview && save.mutate(preview)}
              >
                保存
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
