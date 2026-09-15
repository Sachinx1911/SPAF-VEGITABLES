import type {
  Allocation, AuditLog, Challan, Customer, CustomerItemPrice, DailySnapshot, Database, Invoice, InvoiceItem, Item,
  ModuleKey, Order, OrderItem, OrderSource, PackageType, Packing, PackingItem, Payment, PaymentMode, PurchaseOrder,
  PurchaseOrderItem, PurchaseRequirement, QcReason, QtyChain, QualityCheck, Receiving, ReceivingItem, Route, Supplier,
  User,
} from '../../types/models';
import { addDays, parseISO, toISODateTime } from '../../lib/format';
import { DEMO_NOW } from '../../lib/clock';
import { COMPANY, CONTACT_NAMES, ITEMS, ITEM_QTY_SHEET, PARTIES, ROUTES, SUPPLIERS, type Demand } from './masters';
import { ROLES, USERS } from './roles';

export const SEED_VERSION = 4;

/* ------------------------------------------------------------------ rng */

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateSeed(): Database {
  const r = mulberry32(20260913);
  const between = (a: number, b: number) => a + r() * (b - a);
  const int = (a: number, b: number) => Math.floor(between(a, b + 1));
  const chance = (p: number) => r() < p;
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(r() * arr.length)]!;
  const digits = (n: number) => Array.from({ length: n }, () => int(0, 9)).join('');
  const letters = (n: number) => Array.from({ length: n }, () => String.fromCharCode(65 + int(0, 25))).join('');

  let seq = 0;
  const uid = (p: string) => `${p}_${(++seq).toString(36)}`;

  const TODAY = '2026-09-13';
  const NOW = toISODateTime(DEMO_NOW);
  const at = (date: string, h: number, m: number) =>
    `${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
  const timeBetween = (date: string, from: string, to: string) => {
    const [fh, fm] = from.split(':').map(Number);
    const [th, tm] = to.split(':').map(Number);
    const mins = int(fh! * 60 + fm!, th! * 60 + tm!);
    return at(date, Math.floor(mins / 60), mins % 60);
  };
  const plusMinutes = (iso: string, mins: number) => {
    const d = parseISO(iso);
    d.setMinutes(d.getMinutes() + mins);
    return toISODateTime(d);
  };

  /* ------------------------------------------------------------ masters */

  const routes: Route[] = ROUTES.map((rt, i) => ({
    id: `rt_${rt.code}`,
    code: rt.code,
    name: rt.name,
    area: rt.area,
    driverId: `u_driver${i + 1}`,
    vehicleNo: rt.vehicleNo,
    departureTime: ['07:00', '07:30', '11:00', '11:45', '12:30'][i]!,
  }));

  const PIN: Record<string, string> = {
    'Andheri East': '400069', 'Andheri West': '400053', 'Lower Parel': '400013', 'Bandra West': '400050',
    'Santacruz East': '400055', Powai: '400076', Worli: '400018', Chembur: '400071', Juhu: '400049',
    'Goregaon East': '400063', 'Goregaon West': '400104', 'Khar West': '400052', BKC: '400051',
    'Grant Road': '400007', Mahalaxmi: '400034', Ghatkopar: '400086', 'Malad West': '400064',
    'Mira Road': '401107', Oshiwara: '400102',
  };
  const STREETS = ['Shop No. 3, Ground Floor', 'Unit 2, Level 1', 'Plot 18', 'Gala 7', 'Ground Floor, Wing B', 'Shop 11-12'];

  const customers: Customer[] = PARTIES.map(([routeCode, shortLabel, legalName, name, type, location, routeKey], i) => {
    const contact = CONTACT_NAMES[i % CONTACT_NAMES.length]!;
    const pan = `${letters(3)}${pick(['C', 'F', 'P'])}${letters(1)}${digits(4)}${letters(1)}`;
    const address = `${pick(STREETS)}, ${location}, Mumbai ${PIN[location] ?? '400001'}`;
    const slug = shortLabel.toLowerCase().replace(/[^a-z0-9]+/g, '');
    return {
      id: `c_${routeCode.toLowerCase()}`,
      code: `SPC-${String(i + 1).padStart(3, '0')}`,
      routeCode,
      shortLabel,
      routeOrder: i + 1,
      routeId: `rt_${routeKey}`,
      name,
      legalName,
      type,
      location,
      contactPerson: contact,
      mobile: `9${int(7, 9)}${digits(3)} ${digits(5)}`,
      altMobile: chance(0.5) ? `9${int(0, 9)}${digits(3)} ${digits(5)}` : '',
      email: `purchase@${slug}.co.in`,
      billingAddress: address,
      deliveryAddress: chance(0.8) ? address : `Service entry, ${address}`,
      gstin: `27${pan}1Z${int(1, 9)}`,
      pan,
      paymentTermsDays: pick([7, 7, 15, 15, 30]),
      creditLimit: type === 'Cafe' || type === 'Other' ? pick([50000, 75000]) : pick([100000, 150000, 200000, 300000]),
      orderFrequency: i % 11 === 5 ? 'Alternate Days' : 'Daily',
      preferredOrderTime: pick(['Before 18:00', 'Before 20:00', 'Before 21:30']),
      preferredDeliveryTime: pick(['07:00 – 09:00', '08:00 – 10:00', '09:00 – 11:00', '11:00 – 13:00']),
      specialInstructions: pick([
        '', '', 'Deliver at service gate, call store keeper on arrival.', 'Leafy items in separate crate.',
        'No delivery before 8 AM — society rules.', 'Collect signed challan copy from chef on duty.',
      ]),
      active: true,
      createdAt: at(`2025-${String(int(4, 12)).padStart(2, '0')}-${String(int(1, 28)).padStart(2, '0')}`, 11, 0),
    };
  });
  const custByCode = new Map(customers.map((c) => [c.routeCode, c]));

  const CAT_PREFIX: Record<string, string> = {
    'Indian Vegetables': 'IV', 'Imported Produce': 'IP', 'Herbs & Leafy': 'HL', 'Fresh Fruits': 'FF', 'Exotic Vegetables': 'EX',
  };
  const catCounter: Record<string, number> = {};
  const roundPrice = (v: number) => (v < 20 ? Math.round(v * 2) / 2 : Math.round(v));
  const STORABLE = /Onion|Potato|Garlic|Ginger|Coconut|Pumpkin|Yam|Sweet Potato/;

  const demandOf = new Map<string, Demand>();
  const items: Item[] = ITEMS.map(([excelName, name, category, unit, purchase, demand], i) => {
    const n = (catCounter[category] = (catCounter[category] ?? 0) + 1);
    const id = `i_${CAT_PREFIX[category]!.toLowerCase()}${n}`;
    demandOf.set(id, demand);
    const storable = STORABLE.test(name);
    return {
      id,
      code: `${CAT_PREFIX[category]}-${String(n).padStart(3, '0')}`,
      name,
      excelName,
      category,
      unit,
      purchaseUnit: unit,
      sellingUnit: unit,
      minStock: storable ? (unit === 'Kg' ? 10 : 5) : 0,
      reorderLevel: storable ? (unit === 'Kg' ? 20 : 10) : 0,
      defaultPurchasePrice: purchase,
      defaultSellingPrice: roundPrice(purchase * 1.32),
      taxRate: /Frozen/.test(name) ? 5 : 0,
      stock: 0,
      sortOrder: i + 1,
      active: true,
    };
  });
  const itemById = new Map(items.map((it) => [it.id, it]));
  const itemByExcel = new Map(items.map((it) => [it.excelName, it]));
  const stepOf = (it: Item) => (it.unit === 'Kg' ? (it.defaultPurchasePrice >= 200 ? 0.25 : 0.5) : 1);
  const roundQ = (q: number, it: Item, mode: 'floor' | 'round' | 'ceil' = 'round') => {
    const s = stepOf(it);
    const v = q / s + 1e-9;
    const k = mode === 'floor' ? Math.floor(v) : mode === 'ceil' ? Math.ceil(v - 2e-9) : Math.round(v);
    return Math.round(k * s * 1000) / 1000;
  };

  const suppliers: Supplier[] = SUPPLIERS.map((s, i) => ({ id: `s_${i + 1}`, ...s, categories: [...s.categories] }));
  const supplierFor = (it: Item) => {
    if (it.category === 'Indian Vegetables') return STORABLE.test(it.name) ? 's_5' : 's_1';
    return suppliers.find((s) => s.categories.includes(it.category))!.id;
  };

  /* ------------------------------------------------- customer profiles */

  const ASIAN = new Set(['ZD', 'ZE', 'ZZA']);
  const PURE_VEG = new Set(['ZH', 'ZM', 'ZZN']);
  const BAR_ITEMS = /Lemon|Mint|Cucumber|Ginger|Orange|Pineapple|Watermelon|Grapefruit|Kaffir|Lemon Grass|Basil|Mosambi|Green Apple/;
  const ASIAN_ITEMS = /Bok Choy|Spring Onion|Leek|Lemon Grass|Thai Ginger|Kaffir|Chinese Cabbage|Bean Sprouts|Enoki|Oyster|Edamame|Baby Corn|Mushroom/;

  const PAY: Record<string, 'prompt' | 'weekly' | 'slow' | 'chronic'> = {};
  ['C', 'J', 'ZH', 'ZR', 'ZV', 'R'].forEach((c) => (PAY[c] = 'chronic'));
  ['B', 'L', 'M', 'ZL', 'ZT', 'ZZC', 'H'].forEach((c) => (PAY[c] = 'slow'));
  ['D', 'F', 'ZC', 'ZF', 'ZP', 'ZZH', 'ZZI'].forEach((c) => (PAY[c] = 'weekly'));
  const payOf = (c: Customer) => PAY[c.routeCode] ?? 'prompt';

  const favourites = new Map<string, Map<string, number>>(); // customerId → itemId → base qty
  const prices: CustomerItemPrice[] = [];

  for (const c of customers) {
    const scale =
      ({ Hotel: 1.6, Caterer: 2.1, Corporate: 1.8, Restaurant: 1, Cafe: 0.6, Other: 0.45 } as const)[c.type] * between(0.75, 1.3);
    const fav = new Map<string, number>();
    for (const it of items) {
      const d = demandOf.get(it.id)!;
      let p = d === 'S' ? 0.82 : d === 'M' ? 0.3 : 0.06;
      if (c.type === 'Other') p = BAR_ITEMS.test(it.name) ? 0.8 : it.category === 'Fresh Fruits' ? 0.35 : p * 0.15;
      else if (ASIAN.has(c.routeCode) && ASIAN_ITEMS.test(it.name)) p = 0.85;
      else if (c.type === 'Cafe') p *= it.category === 'Exotic Vegetables' || it.category === 'Fresh Fruits' ? 2.6 : 0.6;
      else if (PURE_VEG.has(c.routeCode)) p *= it.category === 'Indian Vegetables' || it.category === 'Herbs & Leafy' ? 1.3 : 0.25;
      else if (c.type === 'Caterer' || c.type === 'Corporate') p *= it.category === 'Exotic Vegetables' ? 0.4 : 1.25;
      if (!chance(Math.min(p, 0.95))) continue;

      let base: number;
      switch (it.unit) {
        case 'Kg':
          base = d === 'S' ? between(4, 14) : d === 'M' ? between(1, 5) : between(0.5, 3);
          if (/Onion|Potato \(Large\)|Tomato \(Large\)/.test(it.name)) base *= 2.2;
          if (it.defaultPurchasePrice >= 200) base /= 3;
          base *= scale;
          break;
        case 'Pcs':
          base = /Lemon/.test(it.name) ? between(40, 140) * scale : between(2, 10) * Math.max(scale, 0.6);
          break;
        case 'Bdl':
          base = between(4, 14) * scale;
          break;
        case 'Dozen':
          base = between(1, 4);
          break;
        case 'Pkt':
          base = /Garlic/.test(it.name) ? between(1, 4) * scale : between(2, 8) * Math.max(scale, 0.6);
          break;
        default:
          base = between(1, 3);
      }
      fav.set(it.id, Math.max(base, stepOf(it)));

      const price = roundPrice(it.defaultSellingPrice * between(0.94, 1.06));
      if (chance(0.25)) {
        prices.push({
          id: uid('p'), customerId: c.id, itemId: it.id, unit: it.unit,
          price: roundPrice(price * between(0.88, 1.08)), effectiveFrom: '2026-06-01', effectiveTo: '2026-07-31',
        });
      }
      prices.push({ id: uid('p'), customerId: c.id, itemId: it.id, unit: it.unit, price, effectiveFrom: '2026-08-01', effectiveTo: null });
    }
    // guarantee a usable basket
    for (const staple of ['Onion(Large)', 'Tomato (Large)', 'Coriander (Dhaniya) Bdl', 'Green Chilli']) {
      const it = itemByExcel.get(staple)!;
      if (fav.size < 6 && !fav.has(it.id)) {
        fav.set(it.id, roundQ(between(2, 6) * scale + 1, it));
        prices.push({ id: uid('p'), customerId: c.id, itemId: it.id, unit: it.unit, price: it.defaultSellingPrice, effectiveFrom: '2026-08-01', effectiveTo: null });
      }
    }
    favourites.set(c.id, fav);
  }

  const rateFor = (customerId: string, itemId: string, date: string) => {
    const p = prices.find(
      (x) => x.customerId === customerId && x.itemId === itemId && x.effectiveFrom <= date && (!x.effectiveTo || x.effectiveTo >= date),
    );
    return p ? p.price : itemById.get(itemId)!.defaultSellingPrice;
  };

  /* ------------------------------------------------------------- tables */

  const orders: Order[] = [];
  const orderItems: OrderItem[] = [];
  const locks: Database['locks'] = [];
  const requirements: PurchaseRequirement[] = [];
  const purchaseOrders: PurchaseOrder[] = [];
  const purchaseOrderItems: PurchaseOrderItem[] = [];
  const receivings: Receiving[] = [];
  const receivingItems: ReceivingItem[] = [];
  const qualityChecks: QualityCheck[] = [];
  const allocations: Allocation[] = [];
  const packings: Packing[] = [];
  const packingItems: PackingItem[] = [];
  const challans: Challan[] = [];
  const invoices: Invoice[] = [];
  const invoiceItems: InvoiceItem[] = [];
  const payments: Payment[] = [];
  const auditLogs: AuditLog[] = [];

  const DEVICES = ['Chrome · Windows', 'Chrome · Windows', 'Edge · Windows', 'SPAF PWA · Android', 'Safari · iPhone'];
  const audit = (
    atIso: string, userId: string, action: string, module: ModuleKey, recordRef: string,
    customerId: string | null = null, oldValue = '', newValue = '', status: AuditLog['status'] = 'Success',
  ) => {
    if (atIso > NOW) return;
    auditLogs.push({ id: uid('a'), at: atIso, userId, action, module, recordRef, customerId, oldValue, newValue, device: pick(DEVICES), status });
  };

  const counters = { so: 118, po: 31, grn: 29, pk: 206, dc: 206, inv: 1012, rcpt: 188 };
  const orderNo = () => `SO-2609-${String(++counters.so).padStart(4, '0')}`;
  const emptyChain = (): QtyChain => ({
    ordered: null, approved: null, purchased: null, received: null, accepted: null, allocated: null, packed: null,
    dispatched: null, delivered: null, customerAccepted: null, invoiced: null, paid: null,
  });
  const SOURCES: OrderSource[] = ['Customer Portal', 'Customer Portal', 'WhatsApp', 'WhatsApp', 'WhatsApp', 'Phone', 'Staff'];
  const orderTakers = ['u_order', 'u_order2'];

  function createOrder(c: Customer, deliveryDate: string, receivedAt: string, lineProb = 0.78): { order: Order; lines: OrderItem[] } {
    const fav = favourites.get(c.id)!;
    const order: Order = {
      id: uid('o'), orderNo: orderNo(), customerId: c.id, orderDate: receivedAt.slice(0, 10), deliveryDate,
      orderType: 'Regular', source: pick(SOURCES), status: 'Submitted', isLate: false, receivedAt,
      approvedBy: null, approvedAt: null, lockedAt: null, packingStatus: 'Not Started', deliveryStatus: 'Pending',
      invoiceStatus: 'Not Ready', repeatOfOrderId: null, remarks: '', createdBy: pick(orderTakers), createdAt: receivedAt,
    };
    if (order.source === 'Customer Portal' && c.routeCode === 'ZQ') order.createdBy = 'u_cust_terrace';
    const lines: OrderItem[] = [];
    const favIds = [...fav.keys()].sort((a, b) => itemById.get(a)!.sortOrder - itemById.get(b)!.sortOrder);
    for (const itemId of favIds) {
      if (!chance(lineProb)) continue;
      const it = itemById.get(itemId)!;
      const q = Math.max(roundQ(fav.get(itemId)! * between(0.7, 1.3), it), stepOf(it));
      const qty = emptyChain();
      qty.ordered = q;
      lines.push({ id: uid('oi'), orderId: order.id, itemId, unit: it.unit, rate: rateFor(c.id, itemId, deliveryDate), qty, remarks: '' });
    }
    if (lines.length < 3) {
      for (const itemId of favIds.slice(0, 4)) {
        if (lines.some((l) => l.itemId === itemId)) continue;
        const it = itemById.get(itemId)!;
        const qty = emptyChain();
        qty.ordered = roundQ(fav.get(itemId)!, it);
        lines.push({ id: uid('oi'), orderId: order.id, itemId, unit: it.unit, rate: rateFor(c.id, itemId, deliveryDate), qty, remarks: '' });
      }
    }
    if (chance(0.08)) lines[0]!.remarks = pick(['Medium size only', 'Firm, not too ripe', 'Separate bag please', 'Fresh stock only']);
    orders.push(order);
    orderItems.push(...lines);
    audit(receivedAt, order.createdBy, 'Order submitted', 'orders', order.orderNo, c.id, '', `${lines.length} items`);
    return { order, lines };
  }

  function approve(order: Order, lines: OrderItem[], approvedAt: string) {
    order.status = 'Approved';
    order.approvedBy = 'u_ops';
    order.approvedAt = approvedAt;
    for (const l of lines) {
      const it = itemById.get(l.itemId)!;
      l.qty.approved = l.qty.ordered;
      if (chance(0.03) && l.qty.ordered! > stepOf(it) * 2) {
        l.qty.approved = roundQ(l.qty.ordered! * 0.8, it, 'floor');
        l.remarks = 'Reduced on call with chef';
        audit(approvedAt, 'u_ops', 'Quantity changed', 'orders', order.orderNo, order.customerId,
          `${it.name}: ${l.qty.ordered} ${it.unit}`, `${l.qty.approved} ${it.unit}`);
      }
    }
    audit(approvedAt, 'u_ops', 'Order approved', 'orders', order.orderNo, order.customerId, 'Submitted', 'Approved');
  }

  const stock = new Map<string, number>();
  for (const it of items) if (STORABLE.test(it.name)) stock.set(it.id, roundQ(between(0, it.unit === 'Kg' ? 18 : 6), it));

  /* ----------------------------------------------- one delivery cycle */

  type Mode = 'closed' | 'today';

  function runCycle(date: string, mode: Mode) {
    const orderDate = addDays(date, -1);
    const lockAt = at(orderDate, 22, 15);
    const cycle: { order: Order; lines: OrderItem[] }[] = [];

    for (const c of customers) {
      const p = c.orderFrequency === 'Daily' ? 0.9 : 0.5;
      if (c.routeCode !== 'ZQ' && !chance(p)) continue;
      const received = timeBetween(orderDate, '14:30', '21:50');
      const o = createOrder(c, date, received);
      approve(o.order, o.lines, plusMinutes(received, int(12, 55)));
      cycle.push(o);
    }

    if (mode === 'closed' && date === '2026-09-11') {
      // duplicate order sent twice on WhatsApp — rejected
      const dup = cycle[4]!;
      const c = customers.find((x) => x.id === dup.order.customerId)!;
      const rej = createOrder(c, date, plusMinutes(dup.order.receivedAt, 9), 0.6);
      rej.order.status = 'Rejected';
      rej.order.remarks = `Duplicate of ${dup.order.orderNo}`;
      audit(plusMinutes(rej.order.receivedAt, 20), 'u_ops', 'Order rejected', 'orders', rej.order.orderNo, c.id, 'Submitted', 'Rejected — duplicate');
    }

    // Late orders: received after the 22:00 cutoff for next-day delivery.
    const outside = customers.filter((c) => !cycle.some((x) => x.order.customerId === c.id));
    const lateTimes = mode === 'today' ? [at(orderDate, 22, 18), at(orderDate, 23, 5), at(date, 6, 12)] : [at(orderDate, 22, 34)];
    lateTimes.forEach((t, k) => {
      const c = outside[k];
      if (!c) return;
      const o = createOrder(c, date, t, 0.6);
      o.order.isLate = true;
      o.order.orderType = 'Top-up';
      if (mode === 'today') {
        o.order.status = 'Late';
        audit(t, 'u_order', 'Late order flagged', 'orders', o.order.orderNo, c.id, '', 'Received after 22:00 cutoff');
      } else {
        approve(o.order, o.lines, plusMinutes(t, 8));
        cycle.push(o);
      }
    });

    // Lock consolidation
    cycle.forEach(({ order }) => {
      order.status = 'Locked';
      order.lockedAt = lockAt;
    });
    locks.push({ id: uid('lk'), deliveryDate: date, lockedAt: lockAt, lockedBy: 'u_ops', orderIds: cycle.map((x) => x.order.id) });
    audit(lockAt, 'u_ops', 'Consolidation locked', 'consolidation', `Delivery ${date.split('-').reverse().join('-')}`, null, '', `${cycle.length} orders`);

    // Purchase requirement (snapshot)
    const allLines = cycle.flatMap((x) => x.lines);
    const byItem = new Map<string, OrderItem[]>();
    for (const l of allLines) (byItem.get(l.itemId) ?? byItem.set(l.itemId, []).get(l.itemId)!).push(l);
    const genAt = plusMinutes(lockAt, 1);
    audit(genAt, 'u_ops', 'Purchase requirement generated', 'purchase', `PR ${date}`, null, '', `${byItem.size} items`);

    const itemTotals = new Map<string, { required: number; stockUsed: number; purchased: number; received: number; accepted: number }>();
    const shortItems = new Set<string>();
    const excessItems = new Set<string>();
    const candidates = [...byItem.keys()];
    const forcedShort = ['Coriander (Dhaniya) Bdl', 'Broccoli Kg', 'Avocado (IMP) Kg', 'Green Lemon(Pcs)']
      .map((n) => itemByExcel.get(n)!.id)
      .filter((id) => byItem.has(id))
      .slice(0, mode === 'today' ? 3 : 1);
    forcedShort.forEach((id) => shortItems.add(id));
    candidates.forEach((id) => {
      if (!shortItems.has(id) && chance(0.03)) shortItems.add(id);
      else if (!shortItems.has(id) && chance(0.04)) excessItems.add(id);
    });

    // Purchase orders per supplier
    const poBySupplier = new Map<string, PurchaseOrder>();
    const poLineOf = new Map<string, PurchaseOrderItem>();
    for (const [itemId, lines] of [...byItem.entries()].sort((a, b) => itemById.get(a[0])!.sortOrder - itemById.get(b[0])!.sortOrder)) {
      const it = itemById.get(itemId)!;
      const required = roundQ(lines.reduce((s, l) => s + (l.qty.approved ?? 0), 0), it);
      const inStock = stock.get(itemId) ?? 0;
      const stockUsed = Math.min(inStock, required);
      stock.set(itemId, roundQ(inStock - stockUsed, it));
      requirements.push({ id: uid('pr'), deliveryDate: date, itemId, unit: it.unit, requiredQty: required, stockQty: stockUsed, generatedAt: genAt });
      const toBuy = roundQ(required - stockUsed, it, 'ceil');
      let purchased = toBuy;
      if (shortItems.has(itemId)) purchased = roundQ(toBuy * between(0.55, 0.8), it, 'floor');
      if (excessItems.has(itemId)) purchased = roundQ(toBuy + stepOf(it) * int(2, 6), it);
      itemTotals.set(itemId, { required, stockUsed, purchased, received: 0, accepted: 0 });
      if (purchased <= 0) continue;

      const supplierId = supplierFor(it);
      let po = poBySupplier.get(supplierId);
      if (!po) {
        const created = at(date, int(3, 4), int(0, 50));
        po = {
          id: uid('po'), poNo: `PO-2609-${String(++counters.po).padStart(4, '0')}`, supplierId, purchaseDate: date,
          forDeliveryDate: date, supplierInvoiceNo: `${letters(2)}/${digits(4)}`, status: 'Received', taxAmount: 0,
          createdBy: 'u_purchase', createdAt: created,
        };
        poBySupplier.set(supplierId, po);
        purchaseOrders.push(po);
      }
      const line: PurchaseOrderItem = {
        id: uid('poi'), purchaseOrderId: po.id, itemId, unit: it.unit, qty: purchased,
        rate: roundPrice(it.defaultPurchasePrice * between(0.9, 1.1)),
        remarks: shortItems.has(itemId) ? 'Market short — partial lot' : excessItems.has(itemId) ? 'Bought full crate' : '',
      };
      purchaseOrderItems.push(line);
      poLineOf.set(itemId, line);
    }
    for (const po of poBySupplier.values()) {
      const n = purchaseOrderItems.filter((l) => l.purchaseOrderId === po.id).length;
      audit(po.createdAt, 'u_purchase', 'Purchase confirmed', 'purchase', po.poNo, null, '', `${n} items`);
    }

    // Receiving + QC
    const receivingShort = mode === 'today' ? itemByExcel.get('Capsicum (Green)')!.id : null;
    for (const po of poBySupplier.values()) {
      const recAt = plusMinutes(po.createdAt, int(80, 140));
      const grn: Receiving = { id: uid('grn'), grnNo: `GRN-2609-${String(++counters.grn).padStart(4, '0')}`, purchaseOrderId: po.id, receivedAt: recAt, receivedBy: pick(['u_wh', 'u_wh2']), status: 'Received' };
      receivings.push(grn);
      for (const line of purchaseOrderItems.filter((l) => l.purchaseOrderId === po.id)) {
        const it = itemById.get(line.itemId)!;
        let receivedQty = line.qty;
        if (line.itemId === receivingShort || chance(0.02)) receivedQty = roundQ(line.qty * between(0.82, 0.93), it, 'floor');
        if (receivedQty < line.qty) grn.status = 'Partial';
        const ri: ReceivingItem = { id: uid('ri'), receivingId: grn.id, purchaseOrderItemId: line.id, itemId: it.id, unit: it.unit, orderedQty: line.qty, receivedQty, condition: 'Good' };
        let rejected = 0;
        let reason: QcReason | null = null;
        if (chance(0.05) || (mode === 'today' && it.excelName === 'Lady Finger')) {
          rejected = Math.min(roundQ(receivedQty * between(0.05, 0.14), it, 'ceil'), receivedQty);
          reason = pick(['Damaged', 'Overripe', 'Poor Quality', 'Underripe'] as QcReason[]);
          ri.condition = reason === 'Damaged' ? 'Damaged' : 'Average';
        }
        receivingItems.push(ri);
        qualityChecks.push({
          id: uid('qc'), receivingItemId: ri.id, itemId: it.id, unit: it.unit, acceptedQty: roundQ(receivedQty - rejected, it), rejectedQty: rejected,
          grade: rejected ? (rejected / receivedQty > 0.1 ? 'C' : 'B') : 'A', reason, remarks: rejected ? `${reason} — returned to supplier` : '',
          checkedBy: 'u_wh', checkedAt: plusMinutes(recAt, int(10, 25)),
        });
        const t = itemTotals.get(it.id)!;
        t.received = receivedQty;
        t.accepted = roundQ(receivedQty - rejected, it);
      }
      audit(recAt, grn.receivedBy, grn.status === 'Partial' ? 'Stock received (partial)' : 'Stock received', 'receiving', grn.grnNo, null, '', po.poNo, grn.status === 'Partial' ? 'Warning' : 'Success');
    }

    // Allocation — route order decides who is served first on a shortage
    const allocAt = at(date, 5, int(50, 59));
    const routeOrderOf = (orderId: string) => customers.find((c) => c.id === orders.find((o) => o.id === orderId)!.customerId)!.routeOrder;
    for (const [itemId, lines] of byItem) {
      const it = itemById.get(itemId)!;
      const t = itemTotals.get(itemId)!;
      const available = roundQ(t.stockUsed + t.accepted, it);
      const sorted = [...lines].sort((a, b) => routeOrderOf(a.orderId) - routeOrderOf(b.orderId));
      const share = (l: OrderItem, total: number) =>
        Math.min(l.qty.approved!, roundQ((l.qty.approved! * total) / (t.required || 1), it));
      let allocatedSum = 0;
      const ratio = Math.min(1, available / (t.required || 1));
      for (const l of sorted) {
        l.qty.purchased = share(l, t.stockUsed + t.purchased);
        l.qty.received = share(l, t.stockUsed + t.received);
        l.qty.accepted = share(l, available);
        l.qty.allocated = ratio >= 1 ? l.qty.approved : roundQ(l.qty.approved! * ratio, it, 'floor');
        allocatedSum += l.qty.allocated!;
      }
      let spare = roundQ(available - allocatedSum, it, 'floor');
      for (const l of sorted) {
        if (spare < stepOf(it)) break;
        if (l.qty.allocated! < l.qty.approved!) {
          l.qty.allocated = roundQ(l.qty.allocated! + stepOf(it), it);
          spare = roundQ(spare - stepOf(it), it);
        }
      }
      stock.set(itemId, roundQ((stock.get(itemId) ?? 0) + Math.max(spare, 0), it));
      for (const l of sorted) {
        const o = orders.find((x) => x.id === l.orderId)!;
        allocations.push({
          id: uid('al'), orderItemId: l.id, orderId: l.orderId, customerId: o.customerId, itemId, unit: it.unit, deliveryDate: date,
          requiredQty: l.qty.approved!, allocatedQty: l.qty.allocated!, override: false, allocatedBy: 'u_ops', allocatedAt: allocAt,
        });
      }
    }
    audit(allocAt, 'u_ops', 'Stock allocated', 'allocation', `Delivery ${date.split('-').reverse().join('-')}`, null, '', `${allLines.length} lines`);

    // Packing → challan → delivery → invoice
    const byRoute = new Map<string, { order: Order; lines: OrderItem[] }[]>();
    for (const x of cycle.sort((a, b) => routeOrderOf(a.order.id) - routeOrderOf(b.order.id))) {
      const c = customers.find((cc) => cc.id === x.order.customerId)!;
      (byRoute.get(c.routeId) ?? byRoute.set(c.routeId, []).get(c.routeId)!).push(x);
    }
    let partialDone = false;
    let rejectDone = false;
    let issueDone = false;

    for (const route of routes) {
      const group = byRoute.get(route.id) ?? [];
      const [dh, dm] = route.departureTime.split(':').map(Number);
      const dispatchAt = at(date, dh!, dm! + int(0, 8));
      group.forEach(({ order, lines }, idx) => {
        const c = customers.find((cc) => cc.id === order.customerId)!;
        const frac = group.length ? idx / group.length : 0;

        // decide the stage this order reached
        type Reach = 'toPack' | 'packing' | 'issue' | 'packed' | 'transit' | 'delivered';
        let reach: Reach = 'delivered';
        if (mode === 'today') {
          if (route.code === 'R1') reach = frac < 0.6 ? 'delivered' : 'transit';
          else if (route.code === 'R2') reach = frac < 0.3 ? 'delivered' : 'transit';
          else if (route.code === 'R3') reach = 'packed';
          else if (route.code === 'R4') reach = frac < 0.5 ? 'packed' : !issueDone ? 'issue' : 'packing';
          else reach = 'toPack';
          if (reach === 'issue') issueDone = true;
        }

        const packStart = at(date, 6, int(0, 40));
        const packer = pick(['u_wh', 'u_wh2']);
        const packing: Packing = {
          id: uid('pk'), packingNo: `PK-2609-${String(++counters.pk).padStart(4, '0')}`, orderId: order.id, customerId: c.id, deliveryDate: date,
          status: 'To Pack', packages: 0, packedBy: null, startedAt: null, packedAt: null, verified: false, issue: '',
        };
        packings.push(packing);
        let packages = 0;
        lines.forEach((l, li) => {
          const it = itemById.get(l.itemId)!;
          const al = allocations.find((a) => a.orderItemId === l.id)!;
          const type: PackageType = it.unit === 'Box' ? 'Box' : it.unit === 'Kg' && (l.qty.allocated ?? 0) >= 10 ? 'Crate' : 'Bag';
          let packedQty: number | null = null;
          if (reach === 'packing') packedQty = li < lines.length / 2 ? l.qty.allocated : null;
          else if (reach === 'issue') packedQty = li === 0 ? roundQ(Math.max(l.qty.allocated! - stepOf(it) * 2, 0), it) : l.qty.allocated;
          else if (reach !== 'toPack') packedQty = l.qty.allocated;
          if (reach !== 'toPack' && reach !== 'packing' && reach !== 'issue') l.qty.packed = packedQty;
          if (reach === 'packing' && packedQty != null) l.qty.packed = packedQty;
          packingItems.push({ id: uid('pki'), packingId: packing.id, allocationId: al.id, orderItemId: l.id, itemId: it.id, unit: it.unit, allocatedQty: l.qty.allocated!, packedQty, packageType: type });
          if (packedQty) packages += type === 'Crate' ? 1 : 0.34;
        });
        packing.packages = Math.max(1, Math.ceil(packages));

        if (reach === 'toPack') {
          order.packingStatus = 'To Pack';
          return;
        }
        packing.startedAt = packStart;
        packing.packedBy = packer;
        if (reach === 'packing') {
          packing.status = 'Packing';
          order.packingStatus = 'Packing';
          return;
        }
        if (reach === 'issue') {
          const first = itemById.get(lines[0]!.itemId)!;
          packing.status = 'Issue';
          packing.issue = `${first.name} short by ${stepOf(first) * 2} ${first.unit} at packing table — recount requested`;
          order.packingStatus = 'Issue';
          audit(plusMinutes(packStart, 35), packer, 'Packing issue raised', 'packing', packing.packingNo, c.id, '', packing.issue, 'Warning');
          return;
        }
        packing.status = 'Packed';
        packing.verified = true;
        packing.packedAt = plusMinutes(packStart, int(18, 45));
        order.packingStatus = 'Packed';
        audit(packing.packedAt, packer, 'Marked packed', 'packing', packing.packingNo, c.id, 'Packing', 'Packed');

        const challan: Challan = {
          id: uid('dc'), challanNo: `DC-2609-${String(++counters.dc).padStart(4, '0')}`, packingId: packing.id, orderId: order.id,
          customerId: c.id, routeId: route.id, challanDate: date, driverId: route.driverId, vehicleNo: route.vehicleNo,
          status: 'Ready', packages: packing.packages,
          lines: lines.map((l) => ({ orderItemId: l.id, itemId: l.itemId, unit: l.unit, qty: l.qty.packed! })),
          preparedBy: 'u_delivery', packedBy: packer, dispatchedAt: null, deliveredAt: null, receivedByName: '', signature: null,
          photo: null, deliveryRemarks: '',
        };
        challans.push(challan);
        order.deliveryStatus = 'Ready';
        if (reach === 'packed') return;

        challan.dispatchedAt = dispatchAt;
        lines.forEach((l) => (l.qty.dispatched = l.qty.packed));
        order.deliveryStatus = 'Dispatched';
        challan.status = 'Dispatched';
        if (idx === 0) audit(dispatchAt, 'u_delivery', 'Route dispatched', 'delivery', route.name, null, '', `${group.length} drops · ${route.vehicleNo}`);
        if (reach === 'transit') {
          challan.status = 'In Transit';
          order.deliveryStatus = 'In Transit';
          return;
        }

        const deliveredAt = plusMinutes(dispatchAt, 30 + idx * int(18, 26));
        if (deliveredAt > NOW) {
          challan.status = 'In Transit';
          order.deliveryStatus = 'In Transit';
          return;
        }
        challan.deliveredAt = deliveredAt;
        challan.receivedByName = pick(['Store keeper – ', 'Chef – ', 'Kitchen steward – ']) + pick(['Amit', 'Rakesh', 'Salim', 'Dinesh', 'Joseph', 'Vinod', 'Sagar']);
        let partial = false;
        lines.forEach((l, li) => {
          const it = itemById.get(l.itemId)!;
          l.qty.delivered = l.qty.dispatched;
          if (!partialDone && li === 1 && l.qty.dispatched! > stepOf(it) * 2 && idx === 2) {
            l.qty.delivered = roundQ(l.qty.dispatched! - stepOf(it) * 2, it);
            l.remarks = 'Crate damaged in transit';
            partial = true;
            partialDone = true;
          }
          l.qty.customerAccepted = l.qty.delivered;
          if (!rejectDone && idx === 3 && li === 0 && l.qty.delivered! > stepOf(it)) {
            l.qty.customerAccepted = roundQ(l.qty.delivered! - stepOf(it), it);
            l.remarks = 'Customer returned — soft/overripe';
            rejectDone = true;
          }
        });
        challan.status = partial ? 'Partial' : 'Delivered';
        challan.deliveryRemarks = partial ? 'One crate damaged in transit — short quantity noted on challan' : '';
        order.deliveryStatus = partial ? 'Partial' : 'Delivered';
        order.invoiceStatus = 'Ready';
        const fulfilled = lines.every((l) => l.qty.customerAccepted === l.qty.approved);
        order.status = fulfilled ? 'Completed' : 'Partially Fulfilled';
        audit(deliveredAt, route.driverId!, partial ? 'Delivery confirmed (partial)' : 'Delivery confirmed', 'delivery', challan.challanNo, c.id, 'In Transit', challan.status, partial ? 'Warning' : 'Success');

        const makeInvoice = mode === 'closed' || idx % 2 === 0;
        if (makeInvoice) createInvoice(order, lines, c, challan.id, mode === 'closed' ? at(date, 15, int(0, 50)) : plusMinutes(deliveredAt, 20));
      });
    }
  }

  function createInvoice(order: Order, lines: OrderItem[], c: Customer, challanId: string | null, createdAt: string) {
    const date = createdAt.slice(0, 10);
    const inv: Invoice = {
      id: uid('inv'), invoiceNo: `SPAF/26-27/${++counters.inv}`, customerId: c.id, orderId: order.id, challanId, invoiceDate: date,
      dueDate: addDays(date, c.paymentTermsDays), subtotal: 0, taxAmount: 0, total: 0, status: date === TODAY ? 'Generated' : 'Sent',
      createdBy: 'u_accounts', createdAt,
    };
    for (const l of lines) {
      if (!l.qty.customerAccepted) continue;
      const it = itemById.get(l.itemId)!;
      const amount = Math.round(l.qty.customerAccepted * l.rate * 100) / 100;
      inv.subtotal += amount;
      inv.taxAmount += Math.round(amount * it.taxRate) / 100;
      invoiceItems.push({ id: uid('ii'), invoiceId: inv.id, orderItemId: l.id, itemId: it.id, unit: it.unit, qty: l.qty.customerAccepted, rate: l.rate, taxRate: it.taxRate, amount });
      l.qty.invoiced = l.qty.customerAccepted;
    }
    inv.subtotal = Math.round(inv.subtotal * 100) / 100;
    inv.taxAmount = Math.round(inv.taxAmount * 100) / 100;
    inv.total = Math.round(inv.subtotal + inv.taxAmount);
    invoices.push(inv);
    order.invoiceStatus = 'Invoiced';
    audit(createdAt, 'u_accounts', 'Invoice generated', 'invoices', inv.invoiceNo, c.id, '', `₹${inv.total.toLocaleString('en-IN')}`);
    return inv;
  }

  const MODES: PaymentMode[] = ['UPI', 'Bank Transfer', 'Bank Transfer', 'Cheque', 'Cash'];
  function pay(inv: Invoice, amount: number, date: string, remarks = '') {
    if (date > TODAY) return;
    const mode = pick(MODES);
    const recordedAt = date === TODAY ? at(date, 9, int(5, 50)) : at(date, int(11, 18), int(0, 59));
    const p: Payment = {
      id: uid('pay'), receiptNo: `RCPT-${String(++counters.rcpt).padStart(4, '0')}`, customerId: inv.customerId, invoiceId: inv.id,
      paymentDate: date, mode, reference: mode === 'UPI' ? `UPI/${digits(12)}` : mode === 'Bank Transfer' ? `NEFT ${letters(4)}${digits(10)}` : mode === 'Cheque' ? `CHQ ${digits(6)}` : 'Cash receipt',
      amount: Math.round(amount), remarks, recordedBy: 'u_accounts', recordedAt,
    };
    payments.push(p);
    audit(recordedAt, 'u_accounts', 'Payment recorded', 'payments', p.receiptNo, inv.customerId, inv.invoiceNo, `₹${p.amount.toLocaleString('en-IN')} · ${mode}`);
    const paidTotal = payments.filter((x) => x.invoiceId === inv.id).reduce((s, x) => s + x.amount, 0);
    if (paidTotal >= inv.total) {
      for (const ii of invoiceItems.filter((x) => x.invoiceId === inv.id)) {
        const l = orderItems.find((x) => x.id === ii.orderItemId)!;
        l.qty.paid = l.qty.invoiced;
      }
    }
  }

  /* ------------------------------------ archived orders (aged receivables) */

  function archivedOrder(c: Customer, deliveryDate: string) {
    const received = timeBetween(addDays(deliveryDate, -1), '15:00', '21:30');
    const { order, lines } = createOrder(c, deliveryDate, received, 0.45);
    order.status = 'Completed';
    order.approvedBy = 'u_ops';
    order.approvedAt = plusMinutes(received, 25);
    order.lockedAt = at(addDays(deliveryDate, -1), 22, 15);
    order.packingStatus = 'Packed';
    order.deliveryStatus = 'Delivered';
    for (const l of lines) {
      const q = l.qty.ordered!;
      l.qty = { ...l.qty, approved: q, purchased: q, received: q, accepted: q, allocated: q, packed: q, dispatched: q, delivered: q, customerAccepted: q };
    }
    const route = routes.find((rt) => rt.id === c.routeId)!;
    const challan: Challan = {
      id: uid('dc'), challanNo: `DC-${deliveryDate.slice(2, 4)}${deliveryDate.slice(5, 7)}-${String(int(10, 400)).padStart(4, '0')}`,
      packingId: '', orderId: order.id, customerId: c.id, routeId: route.id, challanDate: deliveryDate, driverId: route.driverId,
      vehicleNo: route.vehicleNo, status: 'Delivered', packages: Math.ceil(lines.length / 3),
      lines: lines.map((l) => ({ orderItemId: l.id, itemId: l.itemId, unit: l.unit, qty: l.qty.packed! })),
      preparedBy: 'u_delivery', packedBy: 'u_wh', dispatchedAt: at(deliveryDate, 7, 30), deliveredAt: at(deliveryDate, 9, 10),
      receivedByName: 'Store keeper', signature: null, photo: null, deliveryRemarks: '',
    };
    challans.push(challan);
    return createInvoice(order, lines, c, challan.id, at(deliveryDate, 16, 0));
  }

  const aged: [string, number[]][] = [
    ['C', [-34, -52, -71, -98]], ['J', [-38, -63]], ['ZH', [-41, -66, -93]], ['ZR', [-36, -59]],
    ['ZV', [-45, -79, -112]], ['R', [-33]], ['B', [-19, -27]], ['L', [-22]], ['ZL', [-24]], ['ZT', [-17]],
  ];
  for (const [code, offsets] of aged) {
    const c = custByCode.get(code)!;
    for (const off of offsets.sort((a, b) => a - b)) {
      const inv = archivedOrder(c, addDays(TODAY, off));
      if (off < -90) continue; // untouched — legal notice stage
      if (chance(0.45)) pay(inv, inv.total * pick([0.3, 0.4, 0.5]), addDays(inv.invoiceDate, int(12, 25)), 'Part payment against old dues');
    }
  }

  /* ---------------------------------------------------------- run days */

  runCycle('2026-09-10', 'closed');
  runCycle('2026-09-11', 'closed');
  runCycle('2026-09-12', 'closed');
  runCycle(TODAY, 'today');

  // Payments on recent invoices, by customer behaviour
  for (const inv of invoices.filter((i) => i.invoiceDate >= '2026-09-10' && i.invoiceDate < TODAY)) {
    const c = customers.find((x) => x.id === inv.customerId)!;
    const behaviour = payOf(c);
    if (behaviour === 'prompt') pay(inv, inv.total, addDays(inv.invoiceDate, int(1, 3)));
    else if (behaviour === 'weekly' && inv.invoiceDate === '2026-09-10') pay(inv, inv.total, TODAY, 'Weekly settlement');
    else if (behaviour === 'slow' && inv.invoiceDate === '2026-09-10') pay(inv, inv.total * 0.5, '2026-09-12', 'Part payment');
  }

  // Tomorrow's orders arriving this morning (ordering window for 14-09)
  const TOMORROW = addDays(TODAY, 1);
  const tomorrowCustomers = customers.filter(() => chance(0.55));
  if (!tomorrowCustomers.some((c) => c.routeCode === 'ZQ')) tomorrowCustomers.push(custByCode.get('ZQ')!);
  tomorrowCustomers.forEach((c, k) => {
    const received = timeBetween(TODAY, '07:05', '10:35');
    const { order, lines } = createOrder(c, TOMORROW, received);
    const roll = r();
    if (c.routeCode === 'ZQ') {
      order.source = 'Customer Portal';
      order.createdBy = 'u_cust_terrace';
      return;
    }
    if (k === 5) {
      order.status = 'Rejected';
      order.remarks = 'Customer on credit hold — outstanding above limit';
      audit(plusMinutes(received, 30), 'u_accounts', 'Order rejected', 'orders', order.orderNo, c.id, 'Submitted', 'Rejected — credit hold', 'Warning');
    } else if (roll < 0.1) {
      order.status = 'Draft';
      order.source = 'Customer Portal';
    } else if (roll < 0.52) {
      const appAt = plusMinutes(received, int(10, 40));
      if (appAt <= NOW) approve(order, lines, appAt);
    }
  });

  /* ----------------------------------------------------- final masters */

  for (const it of items) it.stock = stock.get(it.id) ?? 0;

  const users: User[] = USERS.map(([id, name, email, mobile, role, custCode]) => ({
    id, name, email, mobile, role, status: 'Active', customerId: custCode ? custByCode.get(custCode)!.id : null,
    lastLogin: role === 'driver' ? at(TODAY, 6, int(30, 55)) : at(chance(0.8) ? TODAY : '2026-09-12', int(6, 10), int(0, 59)),
  }));

  const snapshots: DailySnapshot[] = [];
  for (let d = -30; d <= -1; d++) {
    const date = addDays(TODAY, d);
    const weekend = [0, 5, 6].includes(parseISO(date).getDay());
    snapshots.push({
      date,
      ordersReceived: int(24, 31) + (weekend ? 5 : 0),
      pendingApproval: int(5, 14),
      locked: int(28, 36),
      purchaseRequired: int(0, 5),
      receivedLines: int(72, 104),
      packingPending: int(6, 20),
      dispatchPending: int(3, 11),
      delivered: int(9, 21),
      outstanding: Math.round(between(310000, 380000) + d * -900),
      salesValue: Math.round(between(142000, 214000) * (weekend ? 1.16 : 1)),
    });
  }

  auditLogs.push(
    { id: uid('a'), at: at(TODAY, 8, 12), userId: 'u_ops', action: 'Price changed', module: 'prices', recordRef: 'Broccoli · Kg', customerId: custByCode.get('ZE')!.id, oldValue: '₹180.00', newValue: '₹195.00', device: 'Chrome · Windows', status: 'Success' },
    { id: uid('a'), at: at(TODAY, 9, 2), userId: 'u_admin', action: 'User login', module: 'users', recordRef: 'Rajesh Patil', customerId: null, oldValue: '', newValue: '', device: 'Chrome · Windows', status: 'Success' },
    { id: uid('a'), at: at(TODAY, 7, 48), userId: 'u_order', action: 'Customer updated', module: 'customers', recordRef: 'SPC-030 · The Terrace Juhu', customerId: custByCode.get('ZQ')!.id, oldValue: 'Delivery 08:00 – 10:00', newValue: 'Delivery 07:00 – 09:00', device: 'Chrome · Windows', status: 'Success' },
    { id: uid('a'), at: at(TODAY, 10, 21), userId: 'u_order2', action: 'Login failed', module: 'users', recordRef: 'kavita.n@svproagro.in', customerId: null, oldValue: '', newValue: 'Wrong password', device: 'SPAF PWA · Android', status: 'Failed' },
  );
  auditLogs.sort((a, b) => (a.at < b.at ? 1 : -1));

  const qtySheetIds = ITEM_QTY_SHEET.map((n) => itemByExcel.get(n)?.id).filter((x): x is string => !!x);

  // A saved "fixed order" for the customer-portal demo account, so the fast-order flow has data on first load.
  const standingTemplates: Database['standingTemplates'] = [];
  const demoCust = custByCode.get('ZQ');
  if (demoCust) {
    const fav = favourites.get(demoCust.id);
    if (fav && fav.size) {
      const lines = [...fav.entries()]
        .sort((a, b) => itemById.get(a[0])!.sortOrder - itemById.get(b[0])!.sortOrder)
        .slice(0, 14)
        .map(([itemId, q]) => ({ itemId, unit: itemById.get(itemId)!.unit, qty: roundQ(q, itemById.get(itemId)!) }));
      standingTemplates.push({
        id: uid('tpl'), customerId: demoCust.id, name: 'Daily Regular', lines,
        createdAt: at('2026-08-20', 10, 0), updatedAt: at('2026-08-20', 10, 0),
      });
    }
  }

  return {
    meta: { version: SEED_VERSION, seededAt: Date.now(), seq },
    settings: {
      ...COMPANY,
      orderCutoffTime: '22:00',
      maxSheetColumns: 14,
      itemQtySheetItemIds: qtySheetIds,
      defaultPaymentTermsDays: 15,
      invoicePrefix: 'SPAF/26-27/',
      challanPrefix: 'DC-',
    },
    routes, customers, items, prices, suppliers, orders, orderItems, locks, requirements, purchaseOrders, purchaseOrderItems,
    receivings, receivingItems, qualityChecks, allocations, packings, packingItems, challans, invoices, invoiceItems, payments,
    openingBalances: [], roles: ROLES, users, auditLogs, snapshots, standingTemplates,
  };
}
