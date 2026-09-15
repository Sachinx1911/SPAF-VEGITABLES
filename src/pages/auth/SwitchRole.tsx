import { useNavigate } from 'react-router';
import { PageHeader } from '../../components/ui/Card';
import { Card } from '../../components/ui/Card';
import { useStore } from '../../store/useStore';
import { USERS } from '../../data/seed/roles';
import { homePathFor } from '../../lib/nav';
import { initials } from '../../lib/format';
import { ROLES } from '../../data/seed/roles';

/** Demo-only affordance: jump between roles without re-typing credentials each time. */
export function SwitchRolePage() {
  const nav = useNavigate();
  const loginAs = useStore((s) => s.loginAs);
  const seen = new Set<string>();
  const byRole = USERS.filter((u) => (seen.has(u[4]) ? false : (seen.add(u[4]), true)));

  return (
    <div>
      <PageHeader title="Switch demo role" description="Jump into any role's view instantly — this is a prototype convenience, not part of the production login." />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {byRole.map(([id, name, , , role]) => {
          const roleInfo = ROLES.find((r) => r.key === role)!;
          return (
            <Card
              key={id}
              className="cursor-pointer p-4 transition-shadow hover:shadow-pop"
              onClick={() => {
                const u = loginAs(id);
                if (u) nav(homePathFor(u.role));
              }}
            >
              <div className="flex items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-700 text-[13px] font-semibold text-white">{initials(name)}</span>
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-semibold text-ink">{name}</p>
                  <p className="truncate text-xs text-muted">{roleInfo.name}</p>
                </div>
              </div>
              <p className="mt-2.5 text-xs text-muted">{roleInfo.description}</p>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
