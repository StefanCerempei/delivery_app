import courierIcon from '../assets/icons/courier.svg';
import liteIcon from '../assets/icons/lite.svg';
import pickupIcon from '../assets/icons/pickup.svg';
import vanIcon from '../assets/icons/van.svg';

export const VEHICLES = [
    {
        id: 'courier',
        name: 'Lugg Courier',
        crewCount: 1,
        crewLabel: '1 mutător',
        badge: null,
        dimensions: 'Portbagaj / Hatchback',
        description: 'Cutii, bagaje, cumpărături din magazin, TV sau colete mici.',
        icon: courierIcon
    },
    {
        id: 'lite',
        name: 'Lugg Lite',
        crewCount: 1,
        crewLabel: '1 mutător',
        badge: null,
        dimensions: 'SUV / Dubiță mică',
        description: '1–2 obiecte medii: fotoliu, birou, comodă sau televizor mare.',
        icon: liteIcon
    },
    {
        id: 'pickup',
        name: 'Lugg Pickup',
        crewCount: 2,
        crewLabel: '2 mutători',
        badge: 'Popular',
        dimensions: 'Benă 2.4m × 1.6m',
        description: 'Canapea, saltea king-size, frigider, mașină de spălat.',
        icon: pickupIcon
    },
    {
        id: 'van',
        name: 'Lugg Van',
        crewCount: 2,
        crewLabel: '2 mutători',
        badge: 'Capacitate max.',
        dimensions: 'Dubă închisă 3.7m',
        description: 'Mutări de garsoniere, colțare mari, multiple piese de mobilier.',
        icon: vanIcon
    }
];