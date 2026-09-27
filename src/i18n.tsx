import React, { createContext, useContext, useMemo, useState } from 'react';

export type Language = 'th' | 'en';

interface LanguageContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem('tato_language');
    return saved === 'en' ? 'en' : 'th';
  });

  const setLanguage = (next: Language) => {
    setLanguageState(next);
    localStorage.setItem('tato_language', next);
    document.documentElement.lang = next;
  };

  const value = useMemo(() => ({ language, setLanguage }), [language]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used inside LanguageProvider');
  return context;
}
