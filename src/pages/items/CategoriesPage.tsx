import { useNavigate } from 'react-router';
import { FolderTree } from 'lucide-react';
import { PageHeader, Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { useDb } from '../../store/useStore';
import { CATEGORIES } from '../../types/models';
import { inr } from '../../lib/format';

const DESCRIPTIONS: Record<(typeof CATEGORIES)[number], string> = {
  'Indian Vegetables': 'Daily staples — onion, potato, tomato, leafy greens and everyday produce.',
  'Imported Produce': 'Berries and other imported lines bought in small, irregular quantities.',
  'Herbs & Leafy': 'Coriander, mint, curry leaves and other bunch/leaf items.',
  'Fresh Fruits': 'Seasonal and everyday fruit for hotels and caterers.',
  'Exotic Vegetables': 'Continental and specialty produce — lettuce, herbs, mushrooms, imported items.',
};

/** Read-only view of the print/category grouping used across consolidation, item quantity and challan sheets. */
export function CategoriesPage() {
  const db = useDb();
  const nav = useNavigate();

  return (
    <div>
      <PageHeader title="Categories" description="Groups items on every printed sheet — consolidation, item quantity and challans." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {CATEGORIES.map((cat) => {
          const items = db.items.filter((i) => i.category === cat);
          const active = items.filter((i) => i.active).length;
          const avgPrice = items.length ? items.reduce((s, i) => s + i.defaultSellingPrice, 0) / items.length : 0;
          return (
            <Card key={cat} className="cursor-pointer transition-shadow hover:shadow-pop" onClick={() => nav(`/items?category=${encodeURIComponent(cat)}`)}>
              <CardHeader title={cat} icon={<FolderTree size={15} />} actions={<Badge tone="brand">{items.length} SKUs</Badge>} />
              <CardBody className="flex flex-col gap-2">
                <p className="text-[13px] text-muted">{DESCRIPTIONS[cat]}</p>
                <div className="mt-1 flex items-center justify-between text-[12.5px]">
                  <span className="text-muted">{active} active</span>
                  <span className="tabular font-medium text-ink">avg {inr(avgPrice, true)}</span>
                </div>
              </CardBody>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
