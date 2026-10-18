import { useState } from 'react';

export default function Counter() {
  const [n, setN] = useState(0);
  return <button onClick={() => setN(n + 1)}>押した回数: {n}</button>;
}
