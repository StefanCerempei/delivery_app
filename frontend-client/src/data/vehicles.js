import courierIcon from '../assets/icons/courier.svg';
import vanIcon from '../assets/icons/van.svg';
import boxTruckIcon from '../assets/icons/box-truck.svg';
import largeTruckIcon from '../assets/icons/large-truck.svg';

// Cele 5 opțiuni din specificația RELOQ. Id-urile trebuie să fie identice
// cu cheile din backend-api/src/pricing.js (altfel estimarea de preț nu se potrivește).
export const VEHICLES = [
    {
        id: 'courier',
        name: 'Courier',
        crewCount: 1,
        crewLabel: '1 mover + standard vehicle',
        badge: null,
        dimensions: 'Standard vehicle',
        description: 'Boxes, luggage, store pickups, TVs or small parcels.',
        icon: courierIcon
    },
    {
        id: 'van_solo',
        name: 'Van – Solo',
        crewCount: 1,
        crewLabel: '1 mover + van',
        badge: null,
        dimensions: 'Cargo van',
        description: 'A few medium items moved with a van and one mover.',
        icon: vanIcon
    },
    {
        id: 'van_team',
        name: 'Van – Team',
        crewCount: 2,
        crewLabel: '2 movers + van',
        badge: 'Popular',
        dimensions: 'Cargo van',
        description: 'Studio / 1-bedroom moves, sofas, appliances.',
        icon: vanIcon
    },
    {
        id: 'truck',
        name: 'Moving Truck',
        crewCount: 2,
        crewLabel: '2 movers + box truck',
        badge: null,
        dimensions: '12–20 ft box truck',
        description: '1–2 bedroom moves with a box truck.',
        icon: boxTruckIcon
    },
    {
        id: 'large_truck',
        name: 'Large Moving Truck',
        crewCount: 3,
        crewLabel: '3 movers + 26 ft truck',
        badge: 'Max',
        dimensions: '26 ft truck',
        description: 'Large homes and full moves with a 3-person crew.',
        icon: largeTruckIcon
    }
];
