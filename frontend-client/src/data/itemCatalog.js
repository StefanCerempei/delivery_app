// Catalog de obiecte pentru pasul „Ce mutăm”.
//
// IMPORTANT (placeholder): valorile `size` (unități de volum) și pragurile de recomandare
// din recommendVehicle() sunt o primă variantă, aleasă de noi ca punctul de pornire.
// Conform specificației RELOQ (secțiunea 7.2 / 8.3), limitele reale de capacitate și
// regulile de potrivire obiect → vehicul trebuie confirmate de RELOQ. Modifică doar aici.

export const ITEM_CATALOG = [
    {
        category: 'Living room',
        items: [
            { id: 'sofa3', label: '3-seat sofa', emoji: '🛋️', size: 8 },
            { id: 'loveseat', label: 'Loveseat', emoji: '🛋️', size: 6 },
            { id: 'armchair', label: 'Armchair', emoji: '💺', size: 3 },
            { id: 'coffee_table', label: 'Coffee table', emoji: '☕', size: 2 },
            { id: 'tv_large', label: 'Large TV', emoji: '📺', size: 2 },
            { id: 'tv_stand', label: 'TV stand', emoji: '📺', size: 2 },
            { id: 'bookshelf', label: 'Bookshelf', emoji: '📚', size: 4 }
        ]
    },
    {
        category: 'Bedroom',
        items: [
            { id: 'mattress_q', label: 'Queen mattress', emoji: '🛏️', size: 4 },
            { id: 'mattress_k', label: 'King mattress', emoji: '🛏️', size: 5 },
            { id: 'bed_frame', label: 'Bed frame', emoji: '🛏️', size: 4 },
            { id: 'dresser', label: 'Dresser', emoji: '🗄️', size: 5 },
            { id: 'nightstand', label: 'Nightstand', emoji: '🪔', size: 2 },
            { id: 'wardrobe', label: 'Wardrobe', emoji: '🧥', size: 7 },
            { id: 'mirror', label: 'Mirror', emoji: '🪞', size: 1 }
        ]
    },
    {
        category: 'Appliances',
        items: [
            { id: 'fridge', label: 'Refrigerator', emoji: '🧊', size: 8 },
            { id: 'washer', label: 'Washer', emoji: '🧺', size: 5 },
            { id: 'dryer', label: 'Dryer', emoji: '🌬️', size: 5 },
            { id: 'dishwasher', label: 'Dishwasher', emoji: '🍽️', size: 4 },
            { id: 'microwave', label: 'Microwave', emoji: '🍲', size: 1 },
            { id: 'stove', label: 'Stove / oven', emoji: '🍳', size: 5 }
        ]
    },
    {
        category: 'Kitchen & dining',
        items: [
            { id: 'dining_table', label: 'Dining table', emoji: '🍽️', size: 6 },
            { id: 'dining_chair', label: 'Dining chair', emoji: '🪑', size: 1 },
            { id: 'bar_stool', label: 'Bar stool', emoji: '🍸', size: 1 },
            { id: 'cabinet', label: 'Cabinet', emoji: '🗄️', size: 5 }
        ]
    },
    {
        category: 'Office',
        items: [
            { id: 'desk', label: 'Office desk', emoji: '💼', size: 4 },
            { id: 'office_chair', label: 'Office chair', emoji: '💺', size: 2 },
            { id: 'filing_cabinet', label: 'Filing cabinet', emoji: '🗃️', size: 3 },
            { id: 'monitor', label: 'Monitor', emoji: '🖥️', size: 1 }
        ]
    },
    {
        category: 'Boxes & other',
        items: [
            { id: 'box_s', label: 'Small box', emoji: '📦', size: 1 },
            { id: 'box_m', label: 'Medium box', emoji: '📦', size: 1.5 },
            { id: 'box_l', label: 'Large box', emoji: '📦', size: 2 },
            { id: 'suitcase', label: 'Suitcase', emoji: '🧳', size: 1.5 },
            { id: 'bicycle', label: 'Bicycle', emoji: '🚲', size: 3 },
            { id: 'rug', label: 'Rug', emoji: '🪮', size: 1.5 },
            { id: 'lamp', label: 'Lamp', emoji: '💡', size: 1 },
            { id: 'plant', label: 'Large plant', emoji: '🪴', size: 1.5 }
        ]
    }
];

// Toate obiectele într-o singură listă (pentru grila compactă).
export const ALL_ITEMS = ITEM_CATALOG.flatMap((c) => c.items);

// Căutare rapidă id → obiect din catalog.
const BY_ID = Object.fromEntries(ALL_ITEMS.map((it) => [it.id, it]));

/** Volumul total estimat (unități) pentru lista de obiecte selectate [{ id, qty }]. */
export function totalSize(items = []) {
    return items.reduce((sum, it) => sum + (BY_ID[it.id]?.size || 0) * (it.qty || 0), 0);
}

// Vehiculele, de la cel mic la cel mare, cu pragul maxim de volum pe care îl acoperă.
// Placeholder — de confirmat cu RELOQ.
const VEHICLE_CAPACITY = [
    { id: 'courier', maxSize: 4 },
    { id: 'van_solo', maxSize: 9 },
    { id: 'van_team', maxSize: 18 },
    { id: 'truck', maxSize: 35 },
    { id: 'large_truck', maxSize: Infinity }
];

/** Recomandă id-ul de vehicul potrivit pentru volumul total al obiectelor. */
export function recommendVehicle(items = []) {
    const size = totalSize(items);
    if (size <= 0) return null;
    return (VEHICLE_CAPACITY.find((v) => size <= v.maxSize) || VEHICLE_CAPACITY[VEHICLE_CAPACITY.length - 1]).id;
}

/** Text pentru comandă/email: „2× 3-seat sofa, 1× Refrigerator”. */
export function itemsToText(items = []) {
    return items
        .filter((it) => it.qty > 0)
        .map((it) => `${it.qty}× ${BY_ID[it.id]?.label || it.id}`)
        .join(', ');
}
