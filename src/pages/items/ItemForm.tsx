import { useState } from 'react';
import { Drawer } from '../../components/ui/Overlay';
import { Button } from '../../components/ui/Button';
import { Field, Input, Select, Switch } from '../../components/ui/Field';
import { PriceInput, QtyInput } from '../../components/ui/Field';
import { InlineError } from '../../components/ui/States';
import { useDb, useCurrentUser } from '../../store/useStore';
import { addItem, suggestItemCode, updateItem } from '../../store/actions';
import { useToast } from '../../components/ui/Toast';
import { CATEGORIES, UNITS, type Item } from '../../types/models';

interface ItemFormProps {
  open: boolean;
  onClose: () => void;
  item?: Item | null;
  onSaved?: (i: Item) => void;
}

const emptyForm = (code: string) => ({
  code, name: '', excelName: '', category: 'Indian Vegetables' as (typeof CATEGORIES)[number], unit: 'Kg' as (typeof UNITS)[number],
  purchaseUnit: 'Kg' as (typeof UNITS)[number], sellingUnit: 'Kg' as (typeof UNITS)[number], minStock: 0, reorderLevel: 0,
  defaultPurchasePrice: 0, defaultSellingPrice: 0, taxRate: 0, active: true,
});

export function ItemForm({ open, onClose, item, onSaved }: ItemFormProps) {
  const db = useDb();
  const user = useCurrentUser()!;
  const toast = useToast();
  const isEdit = !!item;
  const [form, setForm] = useState(() => (item ? { ...item } : emptyForm(suggestItemCode('Indian Vegetables', db.items))));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const onCategoryChange = (category: (typeof CATEGORIES)[number]) => {
    set('category', category);
    if (!isEdit) set('code', suggestItemCode(category, db.items));
  };

  const onUnitChange = (unit: (typeof UNITS)[number]) => {
    setForm((f) => ({ ...f, unit, purchaseUnit: unit, sellingUnit: unit }));
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = 'Item name is required.';
    if (!form.code.trim()) e.code = 'Code is required.';
    else if (db.items.some((i) => i.code.toLowerCase() === form.code.trim().toLowerCase() && i.id !== item?.id)) {
      e.code = `Code "${form.code}" is already used by another item.`;
    }
    if (db.items.some((i) => i.id !== item?.id && i.name.trim().toLowerCase() === form.name.trim().toLowerCase() && i.unit === form.unit)) {
      e.name = `"${form.name}" already exists in ${form.unit} — that combination is one SKU.`;
    }
    if (form.defaultSellingPrice < form.defaultPurchasePrice) e.defaultSellingPrice = 'Selling price is below purchase price.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = () => {
    if (!validate()) return;
    if (isEdit && item) {
      updateItem(item.id, form, user.id);
      toast({ tone: 'success', title: 'Item updated', description: `${form.name} (${form.unit})` });
      onSaved?.({ ...item, ...form });
    } else {
      const created = addItem({ ...form, excelName: form.excelName || form.name }, user.id);
      toast({ tone: 'success', title: 'Item created', description: `${created.name} (${created.unit})` });
      onSaved?.(created);
    }
    onClose();
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={isEdit ? `Edit ${item!.name}` : 'Add item'}
      description={isEdit ? `${item!.code} · ${item!.unit}` : 'Item + unit together are the SKU — a different unit is a different item.'}
      width="520px"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>{isEdit ? 'Save changes' : 'Create item'}</Button></>}
    >
      <div className="flex flex-col gap-4">
        <Field label="Item name" required error={errors.name}>{(id) => <Input id={id} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Yellow Lemon" invalid={!!errors.name} />}</Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category" required>{(id) => <Select id={id} value={form.category} onChange={(e) => onCategoryChange(e.target.value as any)} options={[...CATEGORIES]} />}</Field>
          <Field label="Item code" required error={errors.code}>{(id) => <Input id={id} value={form.code} onChange={(e) => set('code', e.target.value.toUpperCase())} invalid={!!errors.code} />}</Field>
        </div>

        <Field label="Unit" required hint="Purchase and selling unit default to this — the SKU identity.">
          {(id) => <Select id={id} value={form.unit} onChange={(e) => onUnitChange(e.target.value as any)} options={[...UNITS]} />}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Purchase unit">{(id) => <Select id={id} value={form.purchaseUnit} onChange={(e) => set('purchaseUnit', e.target.value as any)} options={[...UNITS]} />}</Field>
          <Field label="Selling unit">{(id) => <Select id={id} value={form.sellingUnit} onChange={(e) => set('sellingUnit', e.target.value as any)} options={[...UNITS]} />}</Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Default purchase price">{() => <PriceInput value={form.defaultPurchasePrice} onChange={(v) => set('defaultPurchasePrice', v ?? 0)} unit={form.unit} />}</Field>
          <Field label="Default selling price" error={errors.defaultSellingPrice}>{() => <PriceInput value={form.defaultSellingPrice} onChange={(v) => set('defaultSellingPrice', v ?? 0)} unit={form.unit} invalid={!!errors.defaultSellingPrice} />}</Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Min stock" hint="0 = bought fresh daily">{() => <QtyInput value={form.minStock} unit={form.unit} onChange={(v) => set('minStock', v ?? 0)} stepper={false} />}</Field>
          <Field label="Reorder level">{() => <QtyInput value={form.reorderLevel} unit={form.unit} onChange={(v) => set('reorderLevel', v ?? 0)} stepper={false} />}</Field>
        </div>
        <Field label="Tax rate (GST %)">{(id) => <Input id={id} type="number" value={form.taxRate} onChange={(e) => set('taxRate', Number(e.target.value))} />}</Field>

        <Switch checked={form.active} onChange={(v) => set('active', v)} label="Active — orderable and purchasable" />
        {Object.keys(errors).length > 0 && <InlineError>Please fix the highlighted fields.</InlineError>}
      </div>
    </Drawer>
  );
}
