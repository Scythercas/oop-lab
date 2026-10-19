// SC-02b 設計比較（基本設計書 §3.7、要件定義書 FR-030〜037）
import { useId, useMemo, useState } from 'react';
import type { ComparePageData, StateView } from '../build/page-data.ts';
import type { SizeMetrics } from '../build/size.ts';
import type { DesignKind } from '../content/schema.ts';
import { type StateDiff, identicalStateDiff, pickInitialFile, reverseStateDiff } from '../domain/diff-view.ts';
import { FileList, SideBySideDiff, UnifiedDiff } from './CodeTable.tsx';
import { hydratedMark, useDisplayLanguage, useHydrated } from './learning-store-client.ts';

interface Props {
  data: ComparePageData;
}

type DiffMode = 'split' | 'unified';

export function sizeText(size: SizeMetrics): string {
  return `${size.files}ファイル・${size.classes}クラス・${size.lines}行`;
}

/** 2つの設計の差分。計算してあるのは並び順で前の設計を左にした組み合わせだけなので、逆なら左右を入れ替える */
function pairDiff(data: ComparePageData, languageId: string, left: DesignKind, right: DesignKind): StateDiff {
  const view = data.byLanguage[languageId];
  if (left === right) {
    const files = view.states[left]?.files ?? [];
    return identicalStateDiff(files.map((file) => ({ path: file.path, lineCount: file.lines.length })));
  }
  const forward = view.pairs[`${left}|${right}`];
  if (forward !== undefined) return forward;
  const backward = view.pairs[`${right}|${left}`];
  return backward === undefined ? identicalStateDiff([]) : reverseStateDiff(backward);
}

function fileOf(state: StateView | undefined, path: string | undefined) {
  return path === undefined ? undefined : state?.files.find((file) => file.path === path);
}

export default function CompareView({ data }: Props) {
  const ids = data.languages.map((language) => language.id);
  const [displayLanguage] = useDisplayLanguage(ids);
  const [left, setLeft] = useState<DesignKind>('unapplied');
  const [right, setRight] = useState<DesignKind>('proper');
  const [mode, setMode] = useState<DiffMode>('split');
  const idPrefix = useId();
  const hydrated = useHydrated();
  // 表示言語や設計を切り替えたら、変更行数が最も多いファイルを選び直す（基本設計書 §6.3、詳細設計書 §5.3）。
  // 選んだファイルは、選んだときの組み合わせと一緒に持ち、組み合わせが変わったら使わない
  const selectionKey = `${displayLanguage}|${left}|${right}`;
  const [selection, setSelection] = useState<{ key: string; files: Record<string, string> }>({ key: '', files: {} });
  const selectedFiles = selection.key === selectionKey ? selection.files : {};

  const diffs = useMemo(
    () => Object.fromEntries(data.languages.map((language) => [language.id, pairDiff(data, language.id, left, right)])),
    [data, left, right],
  );
  const labelOf = (kind: DesignKind) => data.designs.find((design) => design.kind === kind)?.label ?? kind;
  const commentaryKinds = left === right ? [left] : [left, right];

  return (
    <div className="compare-view" {...hydratedMark(hydrated)}>
      <div className="controls">
        <span className="controls__label">比較する設計:</span>
        <label htmlFor={`${idPrefix}-left`}>左</label>
        <select id={`${idPrefix}-left`} value={left} onChange={(event) => setLeft(event.target.value as DesignKind)}>
          {data.designs.map((design) => (
            <option key={design.kind} value={design.kind}>
              {design.label}
            </option>
          ))}
        </select>
        <label htmlFor={`${idPrefix}-right`}>右</label>
        <select id={`${idPrefix}-right`} value={right} onChange={(event) => setRight(event.target.value as DesignKind)}>
          {data.designs.map((design) => (
            <option key={design.kind} value={design.kind}>
              {design.label}
            </option>
          ))}
        </select>
        <fieldset className="controls__radios">
          <legend>差分の表示:</legend>
          <label>
            <input type="radio" name={`${idPrefix}-mode`} checked={mode === 'split'} onChange={() => setMode('split')} />
            左右
          </label>
          <label>
            <input type="radio" name={`${idPrefix}-mode`} checked={mode === 'unified'} onChange={() => setMode('unified')} />
            1列
          </label>
        </fieldset>
      </div>

      <div data-follow-lang>
        {data.languages.map((language) => {
          const view = data.byLanguage[language.id];
          const diff = diffs[language.id];
          const selected = selectedFiles[language.id] ?? pickInitialFile(diff);
          const fileDiff = diff.files.find((file) => file.path === selected);
          const leftState = view.states[left];
          const rightState = view.states[right];
          const leftTitle = `${labelOf(left)}: ${leftState === undefined ? '' : sizeText(leftState.size)}`;
          const rightTitle = `${labelOf(right)}: ${rightState === undefined ? '' : sizeText(rightState.size)}`;
          const caption = `${language.label}: ${selected ?? ''} の差分（左: ${labelOf(left)}、右: ${labelOf(right)}）`;
          return (
            <section key={language.id} data-lang-block={language.id} className="compare-view__language" aria-label={`${language.label} のコード`}>
              {view.unsupported !== undefined && (
                <p className="unsupported-note" role="note">
                  {view.unsupported}
                </p>
              )}
              <FileList
                files={diff.files}
                selected={selected}
                onSelect={(path) => setSelection({ key: selectionKey, files: { ...selectedFiles, [language.id]: path } })}
                label={`${language.label} のファイル`}
              />
              {mode === 'unified' && (
                <p className="size-line">
                  左 {leftTitle} → 右 {rightTitle}
                </p>
              )}
              {fileDiff !== undefined &&
                (mode === 'split' ? (
                  <SideBySideDiff
                    diff={fileDiff}
                    before={fileOf(leftState, selected)}
                    after={fileOf(rightState, selected)}
                    caption={caption}
                    leftTitle={leftTitle}
                    rightTitle={rightTitle}
                  />
                ) : (
                  <UnifiedDiff diff={fileDiff} before={fileOf(leftState, selected)} after={fileOf(rightState, selected)} caption={caption} />
                ))}
            </section>
          );
        })}
      </div>

      <div className="commentary-columns">
        {commentaryKinds.map((kind) => {
          const design = data.designs.find((item) => item.kind === kind);
          return (
            design !== undefined && (
              <section key={kind} className="commentary">
                <h2>{design.label}の設計について</h2>
                <div className="prose" dangerouslySetInnerHTML={{ __html: design.commentaryHtml }} />
              </section>
            )
          );
        })}
      </div>
    </div>
  );
}
