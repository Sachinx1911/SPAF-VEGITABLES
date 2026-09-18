import { api } from '../lib/api';
import type { Category, Unit } from '../types/models';

/**
 * Purchase, receiving and quality check, against the server.
 *
 * The rule these three exist to protect: the purchase order is never edited by
 * what arrives. A short delivery is recorded beside it, not over it, so the gap
 * is still visible when the supplier is asked about it.
 */

/* --------------------------------------------------------- requirements */

export interface RequirementRow {
  itemId: string;
  name: string;
  unit: Unit;
  category: Category;
  requiredQty: number;
  stockQty: number;
  /** Already on a purchase order for this date. */
  purchasedQty: number;
  /** What still has to be bought, after stock and existing orders. */
  toBuyQty: number;
  estimatedRate: number;
  status: 'OK' | 'Partial' | 'Required';
}

export function fetchRequirements(deliveryDate: string): Promise<{ deliveryDate: string; rows: RequirementRow[] }> {
  return api.get('/purchase/requirements', { delivery_date: deliveryDate });
}

/* ------------------------------------------------------- purchase orders */

export interface NewPurchasePayload {
  supplierId: string;
  purchaseDate: string;
  forDeliveryDate: string;
  supplierInvoiceNo?: string;
  taxAmount?: number;
  lines: { itemId: string; qty: number; rate: number }[];
}

export async function createPurchaseOrderApi(input: NewPurchasePayload): Promise<{ id: string; poNo: string }> {
  const res = await api.post<{ purchaseOrder: { id: number; po_no: string } }>('/purchase/orders', {
    supplier_id: input.supplierId,
    purchase_date: input.purchaseDate,
    for_delivery_date: input.forDeliveryDate,
    supplier_invoice_no: input.supplierInvoiceNo,
    tax_amount: input.taxAmount,
    lines: input.lines.map((l) => ({ item_id: l.itemId, qty: l.qty, rate: l.rate })),
  });

  return { id: String(res.purchaseOrder.id), poNo: res.purchaseOrder.po_no };
}

export interface PurchaseQueueRow {
  id: string;
  poNo: string;
  supplier: string;
  purchaseDate: string;
  forDeliveryDate: string;
  lineCount: number;
  totalQty: number;
  status: string;
}

/** Confirmed purchases that have not been fully received. */
export function fetchReceivingQueue(): Promise<{ queue: PurchaseQueueRow[] }> {
  return api.get('/receivings', { pending: true });
}

/* -------------------------------------------------------------- receiving */

export interface ReceiveLinePayload {
  purchaseOrderItemId: string;
  receivedQty: number;
  condition?: 'Good' | 'Average' | 'Damaged';
}

export async function receiveStockApi(
  purchaseOrderId: string,
  lines: ReceiveLinePayload[],
): Promise<{ grnNo: string; status: string }> {
  const res = await api.post<{ receiving: { grn_no: string; status: string } }>('/receivings', {
    purchase_order_id: purchaseOrderId,
    lines: lines.map((l) => ({
      purchase_order_item_id: l.purchaseOrderItemId,
      received_qty: l.receivedQty,
      condition: l.condition ?? 'Good',
    })),
  });

  return { grnNo: res.receiving.grn_no, status: res.receiving.status };
}

/* --------------------------------------------------------- quality check */

export interface QcQueueRow {
  receivingItemId: string;
  grnNo: string;
  itemId: string;
  itemName: string;
  unit: Unit;
  receivedQty: number;
  condition: string;
  receivedAt: string | null;
}

export function fetchQcQueue(): Promise<{ queue: QcQueueRow[] }> {
  return api.get('/quality-checks');
}

export interface QcPayload {
  receivingItemId: string;
  acceptedQty: number;
  rejectedQty: number;
  grade: 'A' | 'B' | 'C' | 'Rejected';
  reason?: string | null;
  remarks?: string;
}

/**
 * Records a grade. This is the only call in the system that adds to stock, and
 * only the accepted quantity does — rejected produce never becomes sellable.
 */
export async function recordQualityCheckApi(input: QcPayload): Promise<{ stockNow: number }> {
  const res = await api.post<{ stockNow: number }>('/quality-checks', {
    receiving_item_id: input.receivingItemId,
    accepted_qty: input.acceptedQty,
    rejected_qty: input.rejectedQty,
    grade: input.grade,
    reason: input.reason ?? null,
    remarks: input.remarks ?? '',
  });

  return res;
}
