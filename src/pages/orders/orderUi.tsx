import type { Category } from '../../types/models';

/** Purely decorative — the mockups carry a produce glyph next to every item and category. */
export const CATEGORY_EMOJI: Record<Category, string> = {
  'Indian Vegetables': '🥬',
  'Imported Produce': '🥑',
  'Herbs & Leafy': '🌿',
  'Fresh Fruits': '🍋',
  'Exotic Vegetables': '🫑',
};

const NAME_EMOJI: [RegExp, string][] = [
  [/tomato/i, '🍅'], [/onion/i, '🧅'], [/potato|aloo/i, '🥔'], [/carrot/i, '🥕'], [/cucumber/i, '🥒'],
  [/chilli|chili|mirch/i, '🌶️'], [/ginger|adrak/i, '🫚'], [/lemon|lime/i, '🍋'], [/corn/i, '🌽'],
  [/mushroom/i, '🍄'], [/broccoli/i, '🥦'], [/capsicum|pepper/i, '🫑'], [/garlic/i, '🧄'], [/avocado/i, '🥑'],
  [/banana/i, '🍌'], [/apple/i, '🍎'], [/grape/i, '🍇'], [/mango/i, '🥭'], [/pineapple/i, '🍍'],
  [/melon/i, '🍉'], [/coconut/i, '🥥'], [/eggplant|brinjal|bharta/i, '🍆'], [/pea/i, '🫛'],
];

export function itemEmoji(name: string, category: Category): string {
  return NAME_EMOJI.find(([re]) => re.test(name))?.[1] ?? CATEGORY_EMOJI[category] ?? '🥬';
}

export function downloadCsv(filename: string, header: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [header, ...rows].map((r) => r.map(esc).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
