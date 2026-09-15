import { Construction } from 'lucide-react';
import { PageHeader } from '../components/ui/Card';
import { EmptyState } from '../components/ui/States';
import { Badge } from '../components/ui/Badge';

/** Placeholder for screens not yet built in the current phase. */
export function ComingSoon({ title, phase }: { title: string; phase: number }) {
  return (
    <div>
      <PageHeader title={title} meta={<Badge tone="brand">Phase {phase}</Badge>} />
      <EmptyState
        icon={Construction}
        title="Coming in this phase"
        description="This screen is planned but not yet built. It will arrive as we work through the phase plan."
      />
    </div>
  );
}
