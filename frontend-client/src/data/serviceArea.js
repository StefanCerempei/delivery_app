// Zona deservită: Massachusetts, de la Worcester spre est (inclusiv Cape Cod și insulele).
// Contur aproximativ (precizie de câteva sute de metri la granițele cu NH / RI / CT).
// Copie a backend-api/src/serviceArea.js (serverul verifică oricum) — modificați-le împreună.

export const SERVICE_AREA_LABEL = 'Massachusetts, from Worcester east';

// [longitudine, latitudine], în sensul acelor de ceasornic, pornind din colțul de nord-vest
export const SERVICE_AREA_POLYGON = [
    [-71.9, 42.705], // vest de Worcester, granița cu NH (Ashby / Townsend)
    [-71.29, 42.697], // Dracut / Pelham NH
    [-71.255, 42.737],
    [-71.2, 42.775], // Methuen / Salem NH
    [-71.15, 42.815],
    [-71.06, 42.835], // Haverhill / Plaistow NH
    [-70.95, 42.87],
    [-70.82, 42.885], // Salisbury / Seabrook NH
    [-70.55, 42.9], // ocean
    [-69.8, 42.1],
    [-69.8, 41.15], // est de Nantucket
    [-71.12, 41.4], // ocean, sud de Westport
    [-71.135, 41.5], // Westport / Little Compton RI
    [-71.135, 41.66],
    [-71.195, 41.675], // Fall River / Tiverton RI
    [-71.26, 41.752], // Swansea / Warren RI
    [-71.348, 41.79], // Seekonk / East Providence RI
    [-71.355, 41.87],
    [-71.381, 41.893], // Attleboro / Pawtucket RI
    [-71.381, 42.01], // Bellingham / Woonsocket RI
    [-71.8, 42.01], // granița de nord a RI
    [-71.8, 42.023],
    [-71.9, 42.025] // Webster / Thompson CT
];

/** Punctul (lat, lng) e în zona deservită? (ray casting) */
export function inServiceArea(lat, lng) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
    let inside = false;
    const poly = SERVICE_AREA_POLYGON;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, yi] = poly[i];
        const [xj, yj] = poly[j];
        if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}

export const OUTSIDE_AREA_MESSAGE =
    'Sorry, we currently serve Massachusetts from Worcester east (including Cape Cod and the Islands). Please choose an address in our service area.';
