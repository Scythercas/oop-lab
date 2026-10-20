// テスト用の教材（テスト計画書 §10）。
// 本物の教材を直してもテストが壊れないよう、概念1つ分の小さな教材をテストのたびに作る。
// コードは Java・C++・VBA でそのまま動き、出力は期待結果と一致する（後の作業単位のテストでも使う）。
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { stringify } from 'yaml';

type Kind = 'unapplied' | 'proper' | 'overapplied';
type Files = Record<string, string>;

interface Scenario {
  lamps: string[];
  label: string;
}

const CONCEPT_ID = 'sample';
const KINDS: Kind[] = ['unapplied', 'proper', 'overapplied'];
const BASE: Scenario = { lamps: ['前照灯', '尾灯'], label: '点灯' };
/** 適切な設計のほうが修正行数が少ない変更（未適用はランプの数だけ直す） */
const STATE_LABEL: Scenario = { lamps: ['前照灯', '尾灯'], label: '点灯中' };
/** 適切な設計でも修正行数が減らない変更（どちらも1行） */
const RENAME_REAR: Scenario = { lamps: ['前照灯', 'テールランプ'], label: '点灯' };
const EXERCISE: Scenario = { lamps: ['前照灯', '尾灯', '車幅灯'], label: '点灯' };

export const FIXTURE_CONCEPT_ID = CONCEPT_ID;

function lines(...items: string[]): string {
  return `${items.join('\n')}\n`;
}

export function expectedOutput(scenario: Scenario): string {
  return lines(...scenario.lamps.map((lamp) => `${lamp} ${scenario.label}`));
}

function javaFiles(kind: Kind, s: Scenario): Files {
  if (kind === 'unapplied') {
    return {
      'Main.java': lines(
        'public class Main {',
        '    public static void main(String[] args) {',
        ...s.lamps.map((lamp) => `        System.out.println("${lamp}" + " ${s.label}");`),
        '    }',
        '}',
      ),
    };
  }
  const type = kind === 'overapplied' ? 'Describable' : 'Lamp';
  const files: Files = {
    'Main.java': lines(
      'public class Main {',
      '    public static void main(String[] args) {',
      `        ${type}[] lamps = { ${s.lamps.map((lamp) => `new Lamp("${lamp}")`).join(', ')} };`,
      `        for (${type} lamp : lamps) {`,
      '            System.out.println(lamp.describe());',
      '        }',
      '    }',
      '}',
    ),
    'Lamp.java': lines(
      kind === 'overapplied' ? 'class Lamp implements Describable {' : 'class Lamp {',
      '    private final String name;',
      '',
      '    Lamp(String name) {',
      '        this.name = name;',
      '    }',
      '',
      ...(kind === 'overapplied' ? ['    @Override', '    public String describe() {'] : ['    String describe() {']),
      `        return name + " ${s.label}";`,
      '    }',
      '}',
    ),
  };
  if (kind === 'overapplied') files['Describable.java'] = lines('interface Describable {', '    String describe();', '}');
  return files;
}

function cppFiles(kind: Kind, s: Scenario): Files {
  if (kind === 'unapplied') {
    return {
      'main.cpp': lines(
        '#include <iostream>',
        '',
        'int main()',
        '{',
        ...s.lamps.map((lamp) => `    std::cout << "${lamp}" << " ${s.label}" << '\\n';`),
        '    return 0;',
        '}',
      ),
    };
  }
  const overapplied = kind === 'overapplied';
  const files: Files = {
    'lamp.h': lines(
      '#ifndef LAMP_H',
      '#define LAMP_H',
      '',
      '#include <iostream>',
      ...(overapplied ? ['#include "describable.h"'] : []),
      '',
      overapplied ? 'class Lamp : public Describable {' : 'class Lamp {',
      'public:',
      '    explicit Lamp(const char* name) : name_(name) {}',
      `    void describe() const${overapplied ? ' override' : ''} { std::cout << name_ << " ${s.label}" << '\\n'; }`,
      '',
      'private:',
      '    const char* name_;',
      '};',
      '',
      '#endif',
    ),
    'main.cpp': lines(
      '#include <array>',
      '',
      '#include "lamp.h"',
      '',
      'int main()',
      '{',
      `    const std::array<Lamp, ${s.lamps.length}> lamps{${s.lamps.map((lamp) => `Lamp("${lamp}")`).join(', ')}};`,
      '    for (const Lamp& lamp : lamps) {',
      '        lamp.describe();',
      '    }',
      '    return 0;',
      '}',
    ),
  };
  if (overapplied) {
    files['describable.h'] = lines(
      '#ifndef DESCRIBABLE_H',
      '#define DESCRIBABLE_H',
      '',
      'class Describable {',
      'public:',
      '    virtual void describe() const = 0;',
      '',
      'protected:',
      '    ~Describable() = default;',
      '};',
      '',
      '#endif',
    );
  }
  return files;
}

function vbaFiles(kind: Kind, s: Scenario): Files {
  if (kind === 'unapplied') {
    return {
      'Program.bas': lines(
        'Option Explicit',
        '',
        'Public Sub Main()',
        ...s.lamps.map((lamp) => `    Debug.Print "${lamp}" & " ${s.label}"`),
        'End Sub',
      ),
    };
  }
  const overapplied = kind === 'overapplied';
  const files: Files = {
    'Program.bas': lines(
      'Option Explicit',
      '',
      'Public Sub Main()',
      '    Dim names As Variant',
      `    names = Array(${s.lamps.map((lamp) => `"${lamp}"`).join(', ')})`,
      '    Dim i As Long',
      '    For i = LBound(names) To UBound(names)',
      '        Dim lamp As Lamp',
      '        Set lamp = New Lamp',
      '        lamp.Init names(i)',
      '        Debug.Print lamp.Describe()',
      '    Next i',
      'End Sub',
    ),
    'Lamp.cls': lines(
      'Option Explicit',
      ...(overapplied ? ['', 'Implements IDescribable'] : []),
      '',
      'Private mName As String',
      '',
      'Public Sub Init(ByVal lampName As String)',
      '    mName = lampName',
      'End Sub',
      '',
      'Public Function Describe() As String',
      `    Describe = mName & " ${s.label}"`,
      'End Function',
      ...(overapplied
        ? ['', 'Private Function IDescribable_Describe() As String', '    IDescribable_Describe = Describe()', 'End Function']
        : []),
    ),
  };
  if (overapplied) files['IDescribable.cls'] = lines('Option Explicit', '', 'Public Function Describe() As String', 'End Function');
  return files;
}

function codeFor(kind: Kind, scenario: Scenario): Record<string, Files> {
  return { java: javaFiles(kind, scenario), cpp: cppFiles(kind, scenario), vba: vbaFiles(kind, scenario) };
}

const EXPLANATION = lines(
  '# サンプル',
  '',
  '## 定義',
  '',
  'テスト用の概念です。',
  '',
  '::: 図 unapplied proper',
  '',
  '::: くわしく',
  '',
  'くわしい説明です。',
  '',
  ':::',
  '',
  '## 目的',
  '',
  'テストに使います。',
  '',
  '## メリット',
  '',
  '仕組みを確かめられます。',
  '',
  '## デメリット',
  '',
  '本物の教材ではありません。',
  '',
  '## 使い時',
  '',
  'テストのとき。',
  '',
  '::: 図 usage',
  '',
  '## 使わない方がよい時',
  '',
  '本番のとき。',
  '',
  '## よくある誤り',
  '',
  '本物の教材と混同すること。',
  '',
  '## 関連概念',
  '',
  'なし。',
);

/** 図（詳細設計書 §3.3）。必ず置く図（spec・設計ごと・usage）をそろえる */
const DIAGRAMS = [
  {
    id: 'spec',
    type: 'structure',
    caption: 'ランプの表示の流れ',
    nodes: [
      { id: 'main', label: 'Main', col: 1, row: 1 },
      { id: 'lamp', label: 'ランプ', lines: ['名前'], col: 2, row: 1 },
    ],
    edges: [{ from: 'main', to: 'lamp', label: '表示を頼む' }],
  },
  ...KINDS.map((kind) => ({
    id: kind,
    type: 'structure',
    caption: `${kind} の構造`,
    nodes: [
      { id: 'main', label: 'Main', col: 1, row: 1 },
      { id: 'lamp', label: 'ランプ', lines: [{ text: kind === 'unapplied' ? '名前（公開）' : '名前（非公開）', style: kind === 'unapplied' ? 'bad' : 'good' }], col: 2, row: 1, style: kind === 'proper' ? 'rule' : 'normal' },
    ],
    edges: [{ from: 'main', to: 'lamp', label: kind === 'unapplied' ? '書き換え' : '頼む', style: kind === 'unapplied' ? 'bad' : 'normal' }],
  })),
  {
    id: 'usage',
    type: 'decision',
    caption: '使うかどうかの判断',
    questions: [{ text: '規則がある？', no: '使わなくてよい' }],
    yes: '使う',
  },
];

const CATEGORIES = ['definition', 'definition', 'merit', 'merit', 'usage', 'usage', 'mistake', 'mistake', 'code', 'code'];

function questions(): object[] {
  return CATEGORIES.map((category, index) => {
    const id = `${CONCEPT_ID}.q${String(index + 1).padStart(2, '0')}`;
    const question: Record<string, unknown> = {
      id,
      category,
      stem: `設問 ${index + 1}`,
      choices: ['a', 'b', 'c', 'd'].map((choice) => ({ id: choice, text: `選択肢 ${choice}` })),
    };
    if (category === 'code') {
      question.code = {
        java: { fileName: 'Lamp.java', content: lines('class Lamp {', '    String name;', '}') },
        cpp: { fileName: 'lamp.h', content: lines('class Lamp {', 'public:', '    const char* name;', '};') },
        vba: { fileName: 'Lamp.cls', content: lines('Option Explicit', '', 'Public LampName As String') },
      };
    }
    return question;
  });
}

function answers(): object[] {
  return CATEGORIES.map((_, index) => ({
    questionId: `${CONCEPT_ID}.q${String(index + 1).padStart(2, '0')}`,
    correct: 'a',
    explanation: '正解の理由',
    wrongReasons: { b: '誤りの理由 b', c: '誤りの理由 c', d: '誤りの理由 d' },
  }));
}

function write(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function writeCode(dir: string, code: Record<string, Files>): void {
  for (const [language, files] of Object.entries(code)) {
    for (const [name, content] of Object.entries(files)) write(join(dir, language, name), content);
  }
}

/** root にテスト用の教材を書き出す。languages.yaml は本物の教材のものを使う */
export function writeFixtureContent(root: string): void {
  copyFileSync(join(process.cwd(), 'content', 'languages.yaml'), join(mkdirAndReturn(root), 'languages.yaml'));
  const dir = join(root, 'concepts', CONCEPT_ID);
  write(
    join(dir, 'concept.yaml'),
    stringify({
      id: CONCEPT_ID,
      order: 1,
      title: 'サンプル',
      theme: '前照灯と尾灯',
      summary: 'テスト用の概念',
      spec: lines('ランプの名前と状態を表示する。', '', '::: 図 spec').trimEnd(),
      related: [],
      variations: KINDS,
    }),
  );
  write(join(dir, 'explanation.md'), EXPLANATION);
  write(join(dir, 'diagrams.yaml'), stringify(DIAGRAMS));
  write(join(dir, 'expected-output.txt'), expectedOutput(BASE));
  write(join(dir, 'notes', 'vba.md'), lines('---', 'unsupported: テスト用の注記です。', '---', 'VBA の補足です。'));
  for (const kind of KINDS) {
    write(join(dir, 'variations', kind, 'commentary.md'), lines('## 良い点', '', '良い点です。', '', '## 問題点', '', '問題点です。'));
    writeCode(join(dir, 'variations', kind), codeFor(kind, BASE));
  }
  const changes: [string, number, 'proper-fewer' | 'proper-not-fewer', Scenario][] = [
    ['state-label', 1, 'proper-fewer', STATE_LABEL],
    ['rename-rear', 2, 'proper-not-fewer', RENAME_REAR],
  ];
  for (const [name, order, expectation, scenario] of changes) {
    const changeDir = join(dir, 'changes', name);
    write(
      join(changeDir, 'change.yaml'),
      stringify({
        id: `${CONCEPT_ID}.${name}`,
        order,
        title: `変更 ${name}`,
        description: '変更の説明',
        expectation,
        commentary: { reason: '差が出た理由', missRisk: '修正漏れが起きやすい箇所', lesson: '分かること' },
      }),
    );
    write(join(changeDir, 'expected-output.txt'), expectedOutput(scenario));
    for (const kind of KINDS) writeCode(join(changeDir, kind), codeFor(kind, scenario));
  }
  write(join(dir, 'quiz', 'questions.yaml'), stringify(questions()));
  write(join(dir, 'quiz', 'answers.yaml'), stringify(answers()));
  const exerciseDir = join(dir, 'exercises', 'ex01');
  write(
    join(exerciseDir, 'exercise.yaml'),
    stringify({
      id: `${CONCEPT_ID}.ex01`,
      statement: '未適用のコードを書き直してください。',
      additionalSpec: '車幅灯を加えてください。',
      checks: [1, 2, 3].map((n) => ({ id: `${CONCEPT_ID}.ex01.c${n}`, text: `チェック ${n}` })),
    }),
  );
  write(join(exerciseDir, 'expected-output.txt'), expectedOutput(EXERCISE));
  writeCode(join(exerciseDir, 'answer'), codeFor('proper', EXERCISE));
}

function mkdirAndReturn(dir: string): string {
  mkdirSync(dir, { recursive: true });
  return dir;
}
