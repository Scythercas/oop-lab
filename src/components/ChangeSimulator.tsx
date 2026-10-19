// SC-02c 変更シミュレーション（基本設計書 §3.8、要件定義書 FR-040〜045）
import { useId, useState } from 'react';
import type { ChangePageData, ChangeView } from '../build/page-data.ts';
import type { DesignKind } from '../content/schema.ts';
import { type DiffMetrics, pickInitialFile } from '../domain/diff-view.ts';
import { STATUS_LABELS, UnifiedDiff } from './CodeTable.tsx';
import { hydratedMark, useDisplayLanguage, useHydrated } from './learning-store-client.ts';

interface Props {
  data: ChangePageData;
}

const PANELS = ['a', 'b'] as const;
type Panel = (typeof PANELS)[number];

function metricsText(metrics: DiffMetrics): string {
  return `${metrics.changedFiles}ファイル・${metrics.hunks}箇所`;
}

export default function ChangeSimulator({ data }: Props) {
  const ids = data.languages.map((language) => language.id);
  const [displayLanguage] = useDisplayLanguage(ids);
  const [changeId, setChangeId] = useState(data.changes[0]?.id ?? '');
  const [kinds, setKinds] = useState<Record<Panel, DesignKind>>({ a: 'unapplied', b: 'proper' });
  const idPrefix = useId();
  const hydrated = useHydrated();
  // 変更要求・設計・表示言語を切り替えたら、変更行数が最も多いファイルを選び直す（§5.3）
  const selectionKey = `${displayLanguage}|${changeId}|${kinds.a}|${kinds.b}`;
  const [selection, setSelection] = useState<{ key: string; files: Record<string, string> }>({ key: '', files: {} });
  const selectedFiles = selection.key === selectionKey ? selection.files : {};

  const change = data.changes.find((item) => item.id === changeId);
  const labelOf = (kind: DesignKind) => data.designs.find((design) => design.kind === kind)?.label ?? kind;

  return (
    <div className="change-simulator" {...hydratedMark(hydrated)}>
      <fieldset className="change-list">
        <legend>変更要求</legend>
        {data.changes.map((item) => (
          <label key={item.id} className="change-list__item">
            <input type="radio" name={`${idPrefix}-change`} value={item.id} checked={item.id === changeId} onChange={() => setChangeId(item.id)} />
            {item.title}
          </label>
        ))}
      </fieldset>

      {change !== undefined && <div className="prose change-description" dangerouslySetInnerHTML={{ __html: change.descriptionHtml }} />}

      <div className="controls">
        <span className="controls__label">比較する設計:</span>
        {PANELS.map((panel, index) => (
          <span key={panel} className="controls__pair">
            {index > 0 && <span aria-hidden="true">と</span>}
            <label htmlFor={`${idPrefix}-${panel}`} className="visually-hidden">
              {index === 0 ? '1つ目の設計' : '2つ目の設計'}
            </label>
            <select
              id={`${idPrefix}-${panel}`}
              value={kinds[panel]}
              onChange={(event) => setKinds((current) => ({ ...current, [panel]: event.target.value as DesignKind }))}
            >
              {data.designs.map((design) => (
                <option key={design.kind} value={design.kind}>
                  {design.label}
                </option>
              ))}
            </select>
          </span>
        ))}
      </div>

      {change !== undefined && (
        <div data-follow-lang>
          {data.languages.map((language) => (
            <LanguageResult
              key={language.id}
              data={data}
              change={change}
              languageId={language.id}
              languageLabel={language.label}
              kinds={kinds}
              labelOf={labelOf}
              selectedFiles={selectedFiles}
              onSelectFile={(fileKey, path) => setSelection({ key: selectionKey, files: { ...selectedFiles, [fileKey]: path } })}
            />
          ))}
        </div>
      )}

      {change !== undefined && <Commentary change={change} />}
    </div>
  );
}

interface LanguageResultProps {
  data: ChangePageData;
  change: ChangeView;
  languageId: string;
  languageLabel: string;
  kinds: Record<Panel, DesignKind>;
  labelOf: (kind: DesignKind) => string;
  selectedFiles: Record<string, string>;
  onSelectFile: (fileKey: string, path: string) => void;
}

function LanguageResult({ data, change, languageId, languageLabel, kinds, labelOf, selectedFiles, onSelectFile }: LanguageResultProps) {
  const idPrefix = useId();
  const results = PANELS.map((panel) => ({ panel, kind: kinds[panel], result: change.byLanguage[languageId]?.[kinds[panel]] }));
  const maxLines = Math.max(1, ...results.map(({ result }) => result?.diff.metrics.changedLines ?? 0));
  const unsupported = data.unsupported[languageId];

  return (
    <section data-lang-block={languageId} aria-label={`${languageLabel} のコード`}>
      {unsupported !== undefined && (
        <p className="unsupported-note" role="note">
          {unsupported}
        </p>
      )}
      <div className="change-panels">
        {results.map(({ panel, kind, result }) => {
          if (result === undefined) return null;
          const fileKey = `${languageId}|${panel}`;
          const selected = selectedFiles[fileKey] ?? pickInitialFile(result.diff);
          const fileDiff = result.diff.files.find((file) => file.path === selected);
          const before = data.before[languageId]?.[kind]?.files.find((file) => file.path === selected);
          const after = result.after.files.find((file) => file.path === selected);
          const { metrics } = result.diff;
          return (
            <section key={panel} className="change-panel" aria-label={`${labelOf(kind)}の設計`}>
              <h3 className="change-panel__title">{labelOf(kind)}</h3>
              <p className="change-panel__metrics">
                修正量: {metricsText(metrics)}
                <br />
                <span className="metric-added">+{metrics.addedLines}行</span> <span className="metric-removed">-{metrics.removedLines}行</span>
              </p>
              <div className="change-panel__file">
                <label htmlFor={`${idPrefix}-${panel}-file`}>ファイル:</label>
                <select
                  id={`${idPrefix}-${panel}-file`}
                  value={selected ?? ''}
                  onChange={(event) => onSelectFile(fileKey, event.target.value)}
                >
                  {result.diff.files.map((file) => (
                    <option key={file.path} value={file.path}>
                      {file.path}（{STATUS_LABELS[file.status]}）
                    </option>
                  ))}
                </select>
              </div>
              {fileDiff !== undefined && (
                <UnifiedDiff
                  diff={fileDiff}
                  before={before}
                  after={after}
                  caption={`${languageLabel}: ${labelOf(kind)}の設計で、${selected ?? ''} の変更前と変更後の差分`}
                />
              )}
            </section>
          );
        })}
      </div>

      <figure className="change-bars">
        <figcaption>修正行数（追加＋削除）</figcaption>
        <dl>
          {results.map(({ panel, kind, result }) => {
            const lines = result?.diff.metrics.changedLines ?? 0;
            return (
              <div key={panel} className="change-bars__row">
                <dt>{labelOf(kind)}</dt>
                <dd>
                  <span className={`change-bars__bar change-bars__bar--${panel}`} style={{ width: `${(lines / maxLines) * 100}%` }} aria-hidden="true" />
                  <span className="change-bars__value">{lines}行</span>
                </dd>
              </div>
            );
          })}
        </dl>
      </figure>
    </section>
  );
}

function Commentary({ change }: { change: ChangeView }) {
  const items = [
    { title: '差が出た理由', html: change.commentaryHtml.reason },
    { title: '修正漏れが起きやすい箇所', html: change.commentaryHtml.missRisk },
    { title: 'この変更から分かること', html: change.commentaryHtml.lesson },
  ];
  return (
    <section className="commentary" aria-labelledby="change-commentary">
      <h2 id="change-commentary">解説</h2>
      {items.map((item) => (
        <section key={item.title}>
          <h3>{item.title}</h3>
          <div className="prose" dangerouslySetInnerHTML={{ __html: item.html }} />
        </section>
      ))}
    </section>
  );
}
