// 実装課題のエディタ（CodeMirror 6。詳細設計書 §5.6）。
// ExerciseEditor が表示されるときにだけ、動的 import で読み込む（要件定義書 NFR-05）。
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { cpp } from '@codemirror/lang-cpp';
import { java } from '@codemirror/lang-java';
import { StreamLanguage, bracketMatching, defaultHighlightStyle, indentUnit, syntaxHighlighting } from '@codemirror/language';
import { vb } from '@codemirror/legacy-modes/mode/vb';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, drawSelection, highlightActiveLine, keymap, lineNumbers } from '@codemirror/view';

export interface EditorOptions {
  doc: string;
  /** languages.yaml の editor（java・cpp・vb）。「その他」のときは undefined で、色付けしない */
  editor: string | undefined;
  maxLength: number;
  label: string;
  onChange: (doc: string) => void;
  onBlur: () => void;
  /** 上限を超える入力を受け付けなかったとき */
  onLimit: () => void;
}

export interface EditorHandle {
  getDoc(): string;
  destroy(): void;
}

function languageSupport(editor: string | undefined): Extension {
  switch (editor) {
    case 'java':
      return java();
    case 'cpp':
      return cpp();
    case 'vb':
      return StreamLanguage.define(vb);
    default:
      return [];
  }
}

export function createEditor(parent: HTMLElement, options: EditorOptions): EditorHandle {
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: options.doc,
      extensions: [
        lineNumbers(),
        history(),
        drawSelection(),
        highlightActiveLine(),
        bracketMatching(),
        indentUnit.of('    '),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        // Tab でインデントする。エディタから出るときは Esc の後に Tab（CodeMirror の標準の動き）
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        languageSupport(options.editor),
        // 下書きの上限を超える入力は受け付けない（§5.6）
        EditorState.transactionFilter.of((transaction) => {
          if (transaction.docChanged && transaction.newDoc.length > options.maxLength) {
            options.onLimit();
            return [];
          }
          return transaction;
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) options.onChange(update.state.doc.toString());
          if (update.focusChanged && !update.view.hasFocus) options.onBlur();
        }),
        EditorView.contentAttributes.of({ 'aria-label': options.label }),
      ],
    }),
  });
  return {
    getDoc: () => view.state.doc.toString(),
    destroy: () => view.destroy(),
  };
}
