// コードと差分を、行番号つきで表示する（基本設計書 §3.7・§3.8、詳細設計書 §4.6）。
// 行の追加・削除は、色に加えて記号（+ ／ -）でも示す（要件定義書 NFR-08）。
import type { HighlightedFile } from '../build/page-data.ts';
import { type FileDiff, type FileStatus, toSideBySide } from '../domain/diff-view.ts';

export const STATUS_LABELS: Record<FileStatus, string> = {
  added: '追加',
  deleted: '削除',
  modified: '変更',
  unchanged: '変更なし',
};

type Mark = 'added' | 'removed' | 'context';

const MARK_SYMBOLS: Record<Mark, string> = { added: '+', removed: '-', context: '' };
const MARK_NAMES: Record<Mark, string | undefined> = { added: '追加', removed: '削除', context: undefined };

/** 色付け済みの1行。教材からビルド時に作った HTML なので、そのまま埋め込む */
function Line({ html }: { html: string | undefined }) {
  return <code className="code-line" dangerouslySetInnerHTML={{ __html: html ?? '' }} />;
}

function MarkCell({ mark }: { mark: Mark }) {
  const name = MARK_NAMES[mark];
  return (
    <td className="code-table__mark">
      {name !== undefined && (
        <>
          <span aria-hidden="true">{MARK_SYMBOLS[mark]}</span>
          <span className="visually-hidden">{name}</span>
        </>
      )}
    </td>
  );
}

/** ファイル1つの全行 */
export function CodeBlock({ file, caption }: { file: HighlightedFile; caption?: string }) {
  return (
    <div className="code-scroll">
      <table className="code-table">
        {caption !== undefined && <caption className="visually-hidden">{caption}</caption>}
        <tbody>
          {file.lines.map((html, index) => (
            <tr key={index}>
              <td className="code-table__num">{index + 1}</td>
              <td className="code-table__code">
                <Line html={html} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface DiffProps {
  diff: FileDiff;
  /** 変更前（左）のファイル。追加されたファイルでは undefined */
  before: HighlightedFile | undefined;
  /** 変更後（右）のファイル。削除されたファイルでは undefined */
  after: HighlightedFile | undefined;
  caption: string;
}

/** 左右に並べた差分（§4.6） */
export function SideBySideDiff({ diff, before, after, caption, leftTitle, rightTitle }: DiffProps & { leftTitle: string; rightTitle: string }) {
  const rows = toSideBySide(diff.rows);
  return (
    <div className="code-scroll">
      <table className="code-table code-table--split">
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            <th scope="col" colSpan={3}>
              {leftTitle}
            </th>
            <th scope="col" colSpan={3}>
              {rightTitle}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const leftMark: Mark = row.left?.changed ? 'removed' : 'context';
            const rightMark: Mark = row.right?.changed ? 'added' : 'context';
            return (
              <tr key={index}>
                <td className="code-table__num">{row.left === undefined ? '' : row.left.line + 1}</td>
                <MarkCell mark={row.left === undefined ? 'context' : leftMark} />
                <td className={`code-table__code${row.left === undefined ? ' is-empty' : row.left.changed ? ' is-removed' : ''}`}>
                  {row.left !== undefined && <Line html={before?.lines[row.left.line]} />}
                </td>
                <td className="code-table__num code-table__num--right">{row.right === undefined ? '' : row.right.line + 1}</td>
                <MarkCell mark={row.right === undefined ? 'context' : rightMark} />
                <td className={`code-table__code${row.right === undefined ? ' is-empty' : row.right.changed ? ' is-added' : ''}`}>
                  {row.right !== undefined && <Line html={after?.lines[row.right.line]} />}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** 1列の差分（変更前と変更後の行番号を並べる） */
export function UnifiedDiff({ diff, before, after, caption }: DiffProps) {
  return (
    <div className="code-scroll">
      <table className="code-table code-table--unified">
        <caption className="visually-hidden">{caption}</caption>
        <thead className="visually-hidden">
          <tr>
            <th scope="col">変更前の行</th>
            <th scope="col">変更後の行</th>
            <th scope="col">変化</th>
            <th scope="col">コード</th>
          </tr>
        </thead>
        <tbody>
          {diff.rows.map((row, index) => {
            const oldLine = row.type === 'added' ? undefined : row.oldLine;
            const newLine = row.type === 'removed' ? undefined : row.newLine;
            const html = row.type === 'added' ? after?.lines[row.newLine] : before?.lines[row.oldLine];
            const mark: Mark = row.type;
            return (
              <tr key={index}>
                <td className="code-table__num">{oldLine === undefined ? '' : oldLine + 1}</td>
                <td className="code-table__num">{newLine === undefined ? '' : newLine + 1}</td>
                <MarkCell mark={mark} />
                <td className={`code-table__code${mark === 'added' ? ' is-added' : mark === 'removed' ? ' is-removed' : ''}`}>
                  <Line html={html} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** 差分のファイル一覧と、選んでいるファイル（同じ言語の中でファイル名によって対応づける。FR-033） */
export function FileList({
  files,
  selected,
  onSelect,
  label,
}: {
  files: FileDiff[];
  selected: string | undefined;
  onSelect: (path: string) => void;
  label: string;
}) {
  return (
    <div className="file-list" role="group" aria-label={label}>
      {files.map((file) => (
        <button
          key={file.path}
          type="button"
          className={`file-list__item file-list__item--${file.status}`}
          aria-pressed={file.path === selected}
          onClick={() => onSelect(file.path)}
        >
          {file.path}
          <span className="file-list__status">（{STATUS_LABELS[file.status]}）</span>
        </button>
      ))}
    </div>
  );
}
