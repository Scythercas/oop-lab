import { codeToTokens, bundledLanguages } from 'shiki';

const vba = `Option Explicit

' シフト位置を切り替える
Implements IShifter

Private mPosition As String

Public Function ShiftTo(ByVal position As String, ByVal speed As Long) As Boolean
    If speed > 0 And position = "P" Then
        ShiftTo = False
        Exit Function
    End If
    mPosition = position
    Debug.Print "現在 " & mPosition
    ShiftTo = True
End Function

Private Property Get IShifter_Position() As String
    IShifter_Position = mPosition
End Property`;

console.log('vb 言語あり:', 'vb' in bundledLanguages, ' vba 別名:', 'vba' in bundledLanguages);
const { tokens } = await codeToTokens(vba, { lang: 'vb', theme: 'github-light' });
const colorOf = {};
for (const line of tokens) for (const t of line) {
  const word = t.content.trim();
  if (['Option', 'Explicit', 'Implements', 'Private', 'Public', 'Function', 'ByVal', 'As', 'String', 'Long', 'Boolean', 'If', 'Then', 'And', 'Exit', 'End', 'Property', 'Get', 'True', 'False'].includes(word)) colorOf[word] = t.color;
  if (word.startsWith("'")) colorOf['(コメント)'] = t.color;
  if (word.startsWith('"')) colorOf['(文字列)'] = t.color;
  if (word === 'Debug.Print' || word === 'Debug' || word === 'Print') colorOf[word] = t.color;
}
console.log(JSON.stringify(colorOf, null, 1));
