import type { StandingOrderTemplate, Unit } from '../types/models';
import { useStore } from './useStore';
import { uid } from '../lib/id';
import { nowISO } from '../lib/clock';

function auditRow(userId: string, action: string, recordRef: string, customerId: string | null, newValue: string) {
  return { id: uid('a'), at: nowISO(), userId, action, module: 'orders' as const, recordRef, customerId, oldValue: '', newValue, device: 'Chrome · Windows', status: 'Success' as const };
}

export interface TemplateLine {
  itemId: string;
  unit: Unit;
  qty: number;
}

/** Saves the customer's current basket as a reusable "fixed order" — no more browsing the catalog every day. */
export function saveTemplate(customerId: string, name: string, lines: TemplateLine[], userId: string): StandingOrderTemplate {
  const { commit } = useStore.getState();
  const now = nowISO();
  const template: StandingOrderTemplate = { id: uid('tpl'), customerId, name, lines, createdAt: now, updatedAt: now };
  commit((d) => ({
    standingTemplates: [...d.standingTemplates, template],
    auditLogs: [auditRow(userId, 'Fixed order saved', name, customerId, `${lines.length} items`), ...d.auditLogs],
  }));
  return template;
}

export function updateTemplate(templateId: string, patch: { name?: string; lines?: TemplateLine[] }, userId: string) {
  const { db, commit } = useStore.getState();
  const before = db.standingTemplates.find((t) => t.id === templateId);
  commit((d) => ({
    standingTemplates: d.standingTemplates.map((t) => (t.id === templateId ? { ...t, ...patch, updatedAt: nowISO() } : t)),
    auditLogs: before ? [auditRow(userId, 'Fixed order updated', before.name, before.customerId, patch.name ?? `${patch.lines?.length ?? before.lines.length} items`), ...d.auditLogs] : d.auditLogs,
  }));
}

export function deleteTemplate(templateId: string, userId: string) {
  const { db, commit } = useStore.getState();
  const before = db.standingTemplates.find((t) => t.id === templateId);
  commit((d) => ({
    standingTemplates: d.standingTemplates.filter((t) => t.id !== templateId),
    auditLogs: before ? [auditRow(userId, 'Fixed order deleted', before.name, before.customerId, ''), ...d.auditLogs] : d.auditLogs,
  }));
}
