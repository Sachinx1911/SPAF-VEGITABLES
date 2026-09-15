import { useMemo, useState } from 'react';
import type { Database, Item, Unit } from '../../types/models';
import { customerFavourites, rateFor, type FavouriteLine } from '../../domain/orders';
import { CATEGORIES } from '../../types/models';

export interface BasketLine {
  itemId: string;
  item: Item;
  unit: Unit;
  qty: number;
  rate: number;
  remarks: string;
}

interface SeedLine {
  itemId: string;
  qty: number;
  rate?: number;
  remarks?: string;
}

/**
 * Shared ordering state for both the staff "New Order" table and the customer
 * "Place Order" screen. Quantities live in one map keyed by item id; every
 * consumer just reads/writes through `setQty`.
 */
export function useOrderBasket(db: Database, customerId: string, deliveryDate: string, seedLines?: SeedLine[]) {
  const favourites = useMemo(() => customerFavourites(db, customerId, deliveryDate), [db, customerId, deliveryDate]);
  const favIds = useMemo(() => new Set(favourites.map((f) => f.item.id)), [favourites]);

  const [quantities, setQuantities] = useState<Record<string, number | null>>(() => {
    const init: Record<string, number | null> = {};
    (seedLines ?? favourites.filter((f) => f.timesOrdered > 0)).forEach((l: any) => {
      init[l.itemId ?? l.item.id] = l.qty ?? l.lastQty ?? null;
    });
    return init;
  });
  const [remarks, setRemarks] = useState<Record<string, string>>({});

  const setQty = (itemId: string, qty: number | null) => setQuantities((q) => ({ ...q, [itemId]: qty }));
  const setRemark = (itemId: string, v: string) => setRemarks((r) => ({ ...r, [itemId]: v }));
  const clear = () => setQuantities({});

  const activeItems = useMemo(() => db.items.filter((i) => i.active), [db.items]);
  const itemById = useMemo(() => new Map(activeItems.map((i) => [i.id, i])), [activeItems]);
  const favByItemId = useMemo(() => new Map(favourites.map((f) => [f.item.id, f])), [favourites]);

  const catalogByCategory = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const cat of CATEGORIES) m.set(cat, activeItems.filter((i) => i.category === cat).sort((a, b) => a.sortOrder - b.sortOrder));
    return m;
  }, [activeItems]);

  const favouritesByCategory = useMemo(() => {
    const m = new Map<string, FavouriteLine[]>();
    for (const cat of CATEGORIES) m.set(cat, favourites.filter((f) => f.item.category === cat));
    return m;
  }, [favourites]);

  const lines: BasketLine[] = useMemo(
    () =>
      Object.entries(quantities)
        .filter(([, q]) => q != null && q > 0)
        .map(([itemId, qty]) => {
          const item = itemById.get(itemId)!;
          return { itemId, item, unit: item.unit, qty: qty!, rate: rateFor(db, customerId, itemId, deliveryDate), remarks: remarks[itemId] ?? '' };
        })
        .filter((l) => !!l.item)
        .sort((a, b) => a.item.sortOrder - b.item.sortOrder),
    [quantities, remarks, itemById, db, customerId, deliveryDate],
  );

  const totalItems = lines.length;
  const totalQtyLines = lines.reduce((s, l) => s + l.qty, 0);
  const totalAmount = lines.reduce((s, l) => s + l.qty * l.rate, 0);

  return {
    favourites, favIds, favByItemId, catalogByCategory, favouritesByCategory, quantities, setQty, remarks, setRemark,
    clear, lines, totalItems, totalQtyLines, totalAmount, itemById,
  };
}
