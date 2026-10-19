// 教材の検証の単体テスト（テスト計画書 UT-VAL-01〜11、UT-CHK-03）
import { mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RuleId } from '../../src/content/diagnostics';
import { findFormatProblems } from '../../src/content/text-format';
import { checkContent } from '../../src/content/validate';
import { findVbaProblems } from '../../src/content/vba-lint';
import { writeFixtureContent } from '../fixtures/content-fixture';

let root: string;
const concept = () => join(root, 'concepts', 'sample');

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

function edit(path: string, change: (text: string) => string): void {
  writeFileSync(path, change(read(path)));
}

function check() {
  return checkContent(root);
}

function errorsOf(rule: RuleId): string[] {
  return check()
    .diagnostics.filter((d) => d.level === 'error' && d.rule === rule)
    .map((d) => `${d.file}: ${d.message}`);
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'content-'));
  writeFixtureContent(root);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('正しい教材', () => {
  it('エラーも警告も出ず、件数をまとめる', () => {
    const result = check();
    expect(result.diagnostics).toEqual([]);
    expect(result.summary).toEqual([
      {
        id: 'sample',
        title: 'サンプル',
        designs: 3,
        changes: 2,
        questions: 10,
        exercises: 1,
        codeStates: { java: 10, cpp: 10, vba: 10 },
      },
    ]);
    expect(result.content.concepts[0].notes.vba).toEqual({ unsupported: 'テスト用の注記です。', body: 'VBA の補足です。\n' });
  });
});

describe('V01 形式', () => {
  it('項目の値が規則に合わない', () => {
    edit(join(concept(), 'concept.yaml'), (t) => t.replace('summary: テスト用の概念', `summary: ${'長'.repeat(41)}`));
    expect(errorsOf('V01').join()).toContain('concepts/sample/concept.yaml: summary');
  });

  it('YAML として読めない', () => {
    writeFileSync(join(concept(), 'quiz', 'answers.yaml'), 'a: [\n');
    expect(errorsOf('V01').join()).toContain('YAML として読めません');
  });

  it('言語に合わない拡張子のファイルがある', () => {
    writeFileSync(join(concept(), 'variations', 'proper', 'java', 'Note.txt'), 'x\n');
    expect(errorsOf('V01').join()).toContain('Java では使えない拡張子');
  });
});

describe('V02 ID', () => {
  it('変更要求の ID がフォルダ名と違う', () => {
    edit(join(concept(), 'changes', 'state-label', 'change.yaml'), (t) => t.replace('sample.state-label', 'sample.other'));
    expect(errorsOf('V02').join()).toContain('フォルダ名「state-label」と違います');
  });

  it('設問の ID の形式が違い、重なっている', () => {
    edit(join(concept(), 'quiz', 'questions.yaml'), (t) => t.replace('id: sample.q02', 'id: sample.q01'));
    expect(errorsOf('V02').join()).toContain('ID「sample.q01」が重なっています');
    edit(join(concept(), 'quiz', 'questions.yaml'), (t) => t.replace('id: sample.q03', 'id: sample.question3'));
    expect(errorsOf('V02').join()).toContain('「sample.q01」の形にしてください');
  });
});

describe('V03 参照', () => {
  it('関連概念がない', () => {
    edit(join(concept(), 'concept.yaml'), (t) => t.replace('related: []', 'related: [missing]'));
    expect(errorsOf('V03')).toEqual(['concepts/sample/concept.yaml: 関連概念「missing」がありません']);
  });

  it('正解のない設問と、誤答の理由が足りない正解', () => {
    edit(join(concept(), 'quiz', 'answers.yaml'), (t) => t.replace('questionId: sample.q10', 'questionId: sample.q09'));
    edit(join(concept(), 'quiz', 'answers.yaml'), (t) => t.replace('    d: 誤りの理由 d\n', ''));
    const errors = errorsOf('V03').join('\n');
    expect(errors).toContain('設問「sample.q10」の正解が 0 件');
    expect(errors).toContain('設問「sample.q09」の正解が 2 件');
    expect(errors).toContain('wrongReasons は、正解以外の選択肢');
  });
});

describe('V04 件数', () => {
  it('変更要求が1件しかなく、proper-fewer もない', () => {
    rmSync(join(concept(), 'changes', 'state-label'), { recursive: true });
    const errors = errorsOf('V04').join('\n');
    expect(errors).toContain('変更要求が 1 件です');
    expect(errors).toContain('proper-fewer');
  });

  it('設問の種類ごとの数が足りない', () => {
    edit(join(concept(), 'quiz', 'questions.yaml'), (t) => t.replace('category: merit', 'category: definition'));
    expect(errorsOf('V04')).toEqual(['concepts/sample/quiz/questions.yaml: 種類「merit」の設問が 1 問です（2 問以上にしてください）']);
  });
});

describe('V05 ファイルのそろい', () => {
  it('言語のフォルダがない', () => {
    rmSync(join(concept(), 'changes', 'rename-rear', 'overapplied', 'cpp'), { recursive: true });
    expect(errorsOf('V05')).toEqual(['concepts/sample/changes/rename-rear/overapplied/cpp: C++ のソースのフォルダがありません']);
  });

  it('実行の入口がない', () => {
    const dir = join(concept(), 'variations', 'unapplied', 'java');
    renameSync(join(dir, 'Main.java'), join(dir, 'App.java'));
    expect(errorsOf('V05')).toEqual(['concepts/sample/variations/unapplied/java: 実行の入口「Main.java」がありません']);
  });

  it('設問のコードが全言語分ない', () => {
    edit(join(concept(), 'quiz', 'questions.yaml'), (t) => t.replace(/ {4}vba:\n(?: {6}.*\n| *\n)+/, ''));
    expect(errorsOf('V05').join()).toContain('VBA のコードがありません');
  });

  it('variations にない設計のフォルダがある', () => {
    edit(join(concept(), 'concept.yaml'), (t) => t.replace('  - overapplied\n', ''));
    expect(errorsOf('V05').join('\n')).toContain('concepts/sample/variations/overapplied: concept.yaml の variations にない設計のフォルダです');
  });
});

describe('V06 書式', () => {
  it('CRLF・行末の空白・BOM・タブを見つける', () => {
    edit(join(concept(), 'explanation.md'), (t) => t.replace(/\n/g, '\r\n'));
    edit(join(concept(), 'variations', 'proper', 'commentary.md'), (t) => t.replace('良い点です。', '良い点です。  '));
    writeFileSync(join(concept(), 'expected-output.txt'), Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('前照灯 点灯\n')]));
    edit(join(concept(), 'variations', 'proper', 'java', 'Lamp.java'), (t) => t.replace('    private', '\tprivate'));
    const errors = errorsOf('V06').join('\n');
    expect(errors).toContain('explanation.md: 改行が CR を含んでいます');
    expect(errors).toContain('commentary.md: 行末に空白があります（3 行目）');
    expect(errors).toContain('expected-output.txt: 先頭に BOM があります');
    expect(errors).toContain('Lamp.java: タブがあります（2 行目');
  });

  it('末尾の改行の数を確かめる', () => {
    expect(findFormatProblems(Buffer.from('a'))).toEqual(['末尾に改行がありません']);
    expect(findFormatProblems(Buffer.from('a\n\n'))).toEqual(['末尾の改行が2つ以上あります']);
    expect(findFormatProblems(Buffer.from('a\n'))).toEqual([]);
  });
});

describe('V07 解説の見出し', () => {
  it('見出しの順番が違う', () => {
    edit(join(concept(), 'explanation.md'), (t) => t.replace('## 定義', '## 仮').replace('## 目的', '## 定義').replace('## 仮', '## 目的'));
    expect(errorsOf('V07').join()).toContain('今は「目的」「定義」');
  });
});

describe('V08 規模の目安', () => {
  it('長いファイルは警告にとどめる', () => {
    const file = join(concept(), 'variations', 'proper', 'java', 'Lamp.java');
    edit(file, (t) => t + '// 追加の行\n'.repeat(60));
    const result = check();
    expect(result.diagnostics.filter((d) => d.level === 'error')).toEqual([]);
    expect(result.diagnostics.map((d) => `${d.rule} ${d.level} ${d.file}`)).toEqual([
      'V08 warning concepts/sample/variations/proper/java/Lamp.java',
    ]);
  });
});

describe('V09 禁止パターン（UT-CHK-03）', () => {
  it('C++ の動的メモリ確保を見つけ、関数の削除指定は許す', () => {
    edit(join(concept(), 'variations', 'proper', 'cpp', 'lamp.h'), (t) =>
      t.replace('private:', '    Lamp(const Lamp&) = delete;\n\nprivate:').replace('const char* name_;', 'const char* name_ = new char[4];'),
    );
    const errors = errorsOf('V09');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('lamp.h: 14 行目が禁止パターン');
  });

  it('設問のコードにも当てはめる', () => {
    edit(join(concept(), 'quiz', 'questions.yaml'), (t) => t.replace('const char* name;', 'std::string name;'));
    expect(errorsOf('V09').join()).toContain('questions.yaml#sample.q09: C++:');
  });
});

describe('V10 VBA の書き方', () => {
  it('Option Explicit・Debug.Print の区切り・MsgBox・1行に複数の文を見つける', () => {
    expect(findVbaProblems('Public Sub Main()\n    Debug.Print "a"; "b"\n    MsgBox "x"\n    x = 1: y = 2\nEnd Sub\n')).toEqual([
      '「Option Explicit」がありません',
      '2 行目: Debug.Print の式は1つにしてください（「;」や「,」で区切らない）',
      '3 行目: MsgBox や InputBox など、画面を出す命令は使わないでください',
      '4 行目: 1行に複数の文を書かないでください（「:」で区切らない）',
    ]);
  });

  it('文字列・コメント・関数の引数・ラベルの中の記号は問題にしない', () => {
    const source = [
      'Option Explicit',
      '',
      'Public Sub Main()',
      '    Debug.Print Format(1, "0") & "; , : MsgBox"',
      "    ' MsgBox や a: b はコメント",
      '    Debug.Print',
      'Done:',
      'End Sub',
      '',
    ].join('\n');
    expect(findVbaProblems(source)).toEqual([]);
  });

  it('教材のファイルに当てはめる', () => {
    edit(join(concept(), 'variations', 'unapplied', 'vba', 'Program.bas'), (t) => t.replace('Option Explicit\n', ''));
    expect(errorsOf('V10')).toEqual(['concepts/sample/variations/unapplied/vba/Program.bas: 「Option Explicit」がありません']);
  });
});

describe('V11 設計の解説', () => {
  it('良い点・問題点の見出しがない', () => {
    writeFileSync(join(concept(), 'variations', 'overapplied', 'commentary.md'), '見出しのない解説です。\n');
    expect(errorsOf('V11')).toEqual([
      'concepts/sample/variations/overapplied/commentary.md: 「過剰適用」の解説に、見出し「## 良い点」か「## 問題点」を入れてください',
    ]);
  });
});
