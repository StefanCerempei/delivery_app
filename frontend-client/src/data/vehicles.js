import courierIcon from '../assets/icons/courier.svg';
import liteIcon from '../assets/icons/lite.svg';
import pickupIcon from '../assets/icons/pickup.svg';
import vanIcon from '../assets/icons/van.svg';

export const VEHICLES = [
    {
        id: 'courier',
        name: 'Reloq Courier',
        crewCount: 1,
        crewLabel: '1 mover',
        badge: null,
        dimensions: 'Trunk / Hatchback',
        description: 'Boxes, luggage, store pickups, TVs, or small parcels.',
        icon: courierIcon
    },
    {
        id: 'lite',
        name: 'Reloq Lite',
        crewCount: 1,
        crewLabel: '1 mover',
        badge: null,
        dimensions: 'SUV / Small Cargo',
        description: '1–2 medium items: armchair, desk, dresser, or large TV.',
        icon: liteIcon
    },
    {
        id: 'pickup',
        name: 'Reloq Pickup',
        crewCount: 2,
        crewLabel: '2 movers',
        badge: 'Popular',
        dimensions: '8ft Pickup Bed',
        description: 'Sofa, king mattress, refrigerator, washer & dryer.',
        icon: pickupIcon
    },
    {
        id: 'van',
        name: 'Reloq Van',
        crewCount: 2,
        crewLabel: '2 movers',
        badge: 'Max Capacity',
        dimensions: '12ft Cargo Van',
        description: 'Studio moves, large sectionals, multiple furniture pieces.',
        icon: vanIcon
    }
];