import { useNavigate } from 'react-router';
import { LogOut, Phone, Truck, UserRound } from 'lucide-react';
import { Card, CardBody } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { useCurrentUser, useDb, useStore } from '../../store/useStore';
import { initials } from '../../lib/format';

export function DriverProfilePage() {
  const db = useDb();
  const user = useCurrentUser()!;
  const logout = useStore((s) => s.logout);
  const nav = useNavigate();
  const route = db.routes.find((r) => r.driverId === user.id);
  const deliveredCount = db.challans.filter((c) => c.driverId === user.id && (c.status === 'Delivered' || c.status === 'Partial')).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-2 py-4">
        <span className="grid size-16 place-items-center rounded-full bg-brand-700 text-[20px] font-semibold text-white">{initials(user.name)}</span>
        <p className="text-[16px] font-semibold text-ink">{user.name}</p>
        <p className="text-[12.5px] text-muted">Driver</p>
      </div>
      <Card>
        <CardBody className="flex flex-col gap-3 text-[13.5px]">
          <Row icon={Phone} label="Mobile" value={user.mobile} />
          <Row icon={Truck} label="Route" value={route?.name ?? '—'} />
          <Row icon={UserRound} label="Vehicle" value={route?.vehicleNo ?? '—'} />
        </CardBody>
      </Card>
      <Card className="p-4 text-center">
        <p className="tabular text-[22px] font-bold text-brand-700">{deliveredCount}</p>
        <p className="text-[12px] text-muted">Total deliveries completed</p>
      </Card>
      <Button variant="danger" size="lg" icon={LogOut} onClick={() => { logout(); nav('/login'); }}>Sign out</Button>
    </div>
  );
}

function Row({ icon: Icon, label, value }: { icon: typeof Phone; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700"><Icon size={16} /></span>
      <div>
        <p className="text-xs text-muted">{label}</p>
        <p className="font-medium text-ink">{value}</p>
      </div>
    </div>
  );
}
