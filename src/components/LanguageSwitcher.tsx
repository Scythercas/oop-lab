// 表示言語の切り替え（要件定義書 FR-010〜012、詳細設計書 §5.4）
import { useEffect } from 'react';
import { hydratedMark, useDisplayLanguage, useHydrated } from './learning-store-client.ts';

interface Props {
  languages: { id: string; label: string }[];
}

export default function LanguageSwitcher({ languages }: Props) {
  const ids = languages.map((language) => language.id);
  const [current, change] = useDisplayLanguage(ids);
  const hydrated = useHydrated();

  // 他のタブで切り替えたときも、このページの表示をそろえる
  useEffect(() => {
    if (hydrated) document.documentElement.setAttribute('data-lang', current);
  }, [current, hydrated]);

  return (
    <div className="language-switcher" role="group" aria-label="表示言語" {...hydratedMark(hydrated)}>
      <span className="language-switcher__label" aria-hidden="true">
        表示言語
      </span>
      {languages.map((language) => (
        <button
          key={language.id}
          type="button"
          className="language-switcher__button"
          data-value={language.id}
          aria-pressed={hydrated ? current === language.id : undefined}
          onClick={() => change(language.id)}
        >
          {language.label}
        </button>
      ))}
    </div>
  );
}
