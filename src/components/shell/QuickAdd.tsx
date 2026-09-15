import { useNavigate } from 'react-router';
import { ClipboardList, HandCoins, PackageOpen, Plus, ShoppingCart, Truck, Users } from 'lucide-react';
import { Menu } from '../ui/Dropdown';
import { Button } from '../ui/Button';
import { useCurrentUser, useDb } from '../../store/useStore';
import { can } from '../../lib/nav';

export function QuickAdd() {
  const nav = useNavigate();
  const user = useCurrentUser();
  const db = useDb();
  if (!user) return null;

  const all = [
    { key: 'order', label: 'New Order', icon: <ClipboardList size={15} />, path: '/orders/new', module: 'orders' as const },
    { key: 'customer', label: 'New Customer', icon: <Users size={15} />, path: '/customers/new', module: 'customers' as const },
    { key: 'purchase', label: 'Purchase Entry', icon: <ShoppingCart size={15} />, path: '/purchase/new', module: 'purchase' as const },
    { key: 'receive', label: 'Receive Stock', icon: <PackageOpen size={15} />, path: '/receiving/new', module: 'receiving' as const },
    { key: 'challan', label: 'Create Challan', icon: <Truck size={15} />, path: '/challans', module: 'delivery' as const },
    { key: 'payment', label: 'Record Payment', icon: <HandCoins size={15} />, path: '/payments/new', module: 'payments' as const },
  ];
  const items = all.filter((i) => can(db, user.role, i.module, 'create')).map((i) => ({ key: i.key, label: i.label, icon: i.icon, onClick: () => nav(i.path) }));
  if (!items.length) return null;

  return (
    <Menu
      align="right"
      items={items}
      trigger={(open) => (
        <Button size="sm" variant="primary" icon={Plus} onClick={open}>
          <span className="hidden sm:inline">Quick Add</span>
        </Button>
      )}
    />
  );
}
