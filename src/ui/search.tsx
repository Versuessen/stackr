import React, { createContext, useContext, useState } from 'react';
import type { ItemCat } from '../domain/items';

// Shared shop search state: the header field drives the item search page.
interface SearchValue {
  q: string; setQ: (q: string) => void;
  cat: ItemCat | 'all'; setCat: (c: ItemCat | 'all') => void;
  set: '' | 'nether' | 'end'; setSet: (s: '' | 'nether' | 'end') => void;
}
const Ctx = createContext<SearchValue | null>(null);

export function SearchProvider({ children }: { children: React.ReactNode }) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<ItemCat | 'all'>('all');
  const [set, setSet] = useState<'' | 'nether' | 'end'>('');
  return <Ctx.Provider value={{ q, setQ, cat, setCat, set, setSet }}>{children}</Ctx.Provider>;
}
export function useSearch() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSearch outside SearchProvider');
  return v;
}
