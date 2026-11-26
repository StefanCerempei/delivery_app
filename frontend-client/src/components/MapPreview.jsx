import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, ZoomControl, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useBooking } from '../context/BookingContext';
import Logo from './Logo';
import { movePin as movePinShared, confirmPin } from '../utils/pinLocation';
import { Link } from 'react-router-dom';
import { useAuth, initials } from '../context/AuthContext';

const DEFAULT_CENTER = [42.3601, -71.0589]; // Boston, MA (zona de operare)

const pickupIcon = L.divIcon({
    className: 'custom-map-pin',
    html: `<div style="width:18px;height:18px;background:#ff3f34;border:3px solid #0a0f18;border-radius:50%;box-shadow:0 0 0 6px rgba(255,63,52,0.28),0 6px 16px rgba(0,0,0,0.5);"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9]
});

const dropoffIcon = L.divIcon({
    className: 'custom-map-pin',
    html: `<div style="width:18px;height:18px;background:#2dd4a7;border:3px solid #0a0f18;border-radius:5px;box-shadow:0 0 0 6px rgba(45,212,167,0.25),0 6px 16px rgba(0,0,0,0.5);"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9]
});

// Pinul mare, ușor de prins cu degetul, cât timp e în modul de marcare
const bigPin = (color) =>
    L.divIcon({
        className: 'custom-map-pin',
        html: `<div style="position:relative;width:34px;height:46px;transform:translateY(-4px)"><svg width="34" height="46" viewBox="0 0 34 46"><path d="M17 45s15-16 15-28A15 15 0 0 0 2 17c0 12 15 28 15 28z" fill="${color}" stroke="#0a0f18" stroke-width="3"/><circle cx="17" cy="17" r="6" fill="#0a0f18"/></svg></div>`,
        iconSize: [34, 46],
        iconAnchor: [17, 46]
    });
const pickupIconBig = bigPin('#ff3f34');
const dropoffIconBig = bigPin('#2dd4a7');

const MapViewportUpdater = ({ pickup, dropoff, routeCoords, pinMode }) => {
    const map = useMap();

    // La marcarea pe hartă: zoom pe pinul ales, apoi harta nu se mai mută singură cât tragi pinul.
    // Pe telefon containerul își schimbă înălțimea (36% ↔ 75% din ecran): Leaflet trebuie să-și recalculeze mărimea.
    useEffect(() => {
        const target = pinMode === 'pickup' ? pickup : pinMode === 'dropoff' ? dropoff : null;
        const timer = setTimeout(() => {
            map.invalidateSize();
            if (target?.lat) {
                map.flyTo([target.lat, target.lng], 18, { duration: 0.6 });
            } else if (routeCoords?.length) {
                map.fitBounds(L.latLngBounds(routeCoords), { padding: [80, 80] });
            } else if (pickup?.lat && dropoff?.lat) {
                map.fitBounds(L.latLngBounds([[pickup.lat, pickup.lng], [dropoff.lat, dropoff.lng]]), { padding: [80, 80] });
            }
        }, 320); // după animația de înălțime
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [map, pinMode]);

    useEffect(() => {
        if (pinMode) return;
        if (routeCoords && routeCoords.length > 0) {
            map.fitBounds(L.latLngBounds(routeCoords), { padding: [80, 80] });
        } else if (pickup?.lat && dropoff?.lat) {
            map.fitBounds(
                L.latLngBounds([
                    [pickup.lat, pickup.lng],
                    [dropoff.lat, dropoff.lng]
                ]),
                { padding: [80, 80] }
            );
        } else if (pickup?.lat) {
            map.flyTo([pickup.lat, pickup.lng], 15);
        } else if (dropoff?.lat) {
            map.flyTo([dropoff.lat, dropoff.lng], 15);
        }
    }, [map, pickup, dropoff, routeCoords, pinMode]);

    return null;
};

/** În modul de marcare, o atingere pe hartă mută pinul acolo. */
const PinClickHandler = ({ pinMode, onPin }) => {
    useMapEvents({
        click: (e) => {
            if (pinMode) onPin(e.latlng);
        }
    });
    return null;
};

const MapPreview = () => {
    const { bookingData, updateBookingData, pinMode, setPinMode } = useBooking();

    // Pinul mutat de client: adresa scrisă rămâne; locurile alese direct pe hartă primesc adresa punctului
    const movePin = (kind, latlng) => movePinShared(updateBookingData, kind, latlng, bookingData[kind]);
    const [routeCoords, setRouteCoords] = useState([]);
    const { pickup, dropoff, routeInfo } = bookingData;

    useEffect(() => {
        if (!pickup?.lat || !dropoff?.lat) {
            setRouteCoords([]);
            return;
        }

        const controller = new AbortController();

        async function fetchRoute() {
            try {
                const url = `https://router.project-osrm.org/route/v1/driving/${pickup.lng},${pickup.lat};${dropoff.lng},${dropoff.lat}?overview=full&geometries=geojson`;
                const res = await fetch(url, { signal: controller.signal });
                const data = await res.json();

                if (data.code === 'Ok' && data.routes?.length > 0) {
                    const route = data.routes[0];
                    const latLngs = route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
                    setRouteCoords(latLngs);

                    const distanceKm = Number((route.distance / 1000).toFixed(2));
                    const distanceMiles = Number((distanceKm * 0.621371).toFixed(1));

                    updateBookingData({
                        routeInfo: {
                            distanceKm,
                            distanceMiles,
                            durationMins: Math.max(1, Math.round(route.duration / 60))
                        }
                    });
                }
            } catch (err) {
                if (err.name !== 'AbortError') {
                    console.error('OSRM route error:', err);
                }
            }
        }

        fetchRoute();
        return () => controller.abort();
    }, [pickup?.lat, pickup?.lng, dropoff?.lat, dropoff?.lng]);

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            <AccountChip />

            <div className="map-floating-hud">
                <div className="hud-brand">
                    <Logo height={20} />
                </div>
                {pickup?.lat && dropoff?.lat && routeInfo && (
                    <div className="hud-route-pill">
                        <span>{routeInfo.distanceMiles} mi</span>
                        <span className="hud-sep">•</span>
                        <span>~{routeInfo.durationMins} min</span>
                    </div>
                )}
            </div>

            {pinMode && (
                <div className="pin-banner">
                    <span>
                        <strong>{pinMode === 'pickup' ? 'Pickup' : 'Drop-off'}:</strong> drag the pin or tap the map on the exact
                        building.
                    </span>
                    <button
                        type="button"
                        onClick={() => {
                            confirmPin(updateBookingData, pinMode, bookingData[pinMode]);
                            setPinMode(null);
                        }}
                    >
                        Done
                    </button>
                </div>
            )}

            <MapContainer
                center={DEFAULT_CENTER}
                zoom={11}
                style={{ width: '100%', height: '100%', backgroundColor: '#a3a3a1' }}
                zoomControl={false}
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {/* Butoanele + / − (zoom), jos în dreapta */}
                <ZoomControl position="bottomright" zoomInTitle="Zoom in" zoomOutTitle="Zoom out" />

                <MapViewportUpdater pickup={pickup} dropoff={dropoff} routeCoords={routeCoords} pinMode={pinMode} />
                <PinClickHandler pinMode={pinMode} onPin={(latlng) => movePin(pinMode, latlng)} />

                {[
                    ['pickup', pickup, pickupIcon],
                    ['dropoff', dropoff, dropoffIcon]
                ].map(
                    ([kind, loc, icon]) =>
                        loc?.lat && (
                            <Marker
                                key={`${kind}-${pinMode === kind}`}
                                position={[loc.lat, loc.lng]}
                                icon={pinMode === kind ? (kind === 'pickup' ? pickupIconBig : dropoffIconBig) : icon}
                                draggable={pinMode === kind}
                                eventHandlers={{ dragend: (e) => movePin(kind, e.target.getLatLng()) }}
                                zIndexOffset={pinMode === kind ? 1000 : 0}
                            />
                        )
                )}

                {routeCoords.length > 0 && (
                    <>
                        <Polyline
                            positions={routeCoords}
                            pathOptions={{ color: '#ff3f34', weight: 12, opacity: 0.18 }}
                        />
                        <Polyline
                            positions={routeCoords}
                            pathOptions={{ color: '#ff3f34', weight: 4, opacity: 0.95, lineCap: 'round', lineJoin: 'round' }}
                        />
                    </>
                )}
            </MapContainer>
        </div>
    );
};


/** Butonul de cont din colțul hărții: „Log in” sau avatarul clientului. */
const AccountChip = () => {
    const { user, authChecked } = useAuth();
    if (!authChecked) return null;
    if (!user) {
        return (
            <Link to="/login?next=/" className="hud-account">
                Log in
            </Link>
        );
    }
    const target = user.role === 'admin' ? '/admin/dashboard' : '/account';
    return (
        <Link to={target} className="hud-account signed-in" title="My account">
            <span className="hud-account-avatar">{initials(user.fullName)}</span>
            {user.role === 'admin' ? 'Dispatch' : 'My account'}
        </Link>
    );
};

export default MapPreview;
