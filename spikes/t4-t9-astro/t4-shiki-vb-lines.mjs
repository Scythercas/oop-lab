import { codeToTokens } from 'shiki';
const lines = ['Option Explicit', 'Implements IShifter', 'Public Function ShiftTo(ByVal position As String) As Boolean', '        Exit Function', 'End Function', 'Private Property Get IShifter_Position() As String', 'Set t = New Tire'];
for (const l of lines) {
  const { tokens } = await codeToTokens(l, { lang: 'vb', theme: 'github-light' });
  console.log(tokens[0].filter(t => t.content.trim()).map(t => `${t.content.trim()}[${t.color === '#24292E' ? '無色' : t.color}]`).join(' '));
}
