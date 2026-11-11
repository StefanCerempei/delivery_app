import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useBooking } from '../context/BookingContext';

const DEFAULT_CENTER = [37.7749, -122.4194]; // San Francisco

const pickupIcon = L.divIcon({
    className: 'custom-map-pin',
    html: `<div style="width:18px;height:18px;background:#2563eb;border:3px solid #ffffff;border-radius:50%;box-shadow:0 0 0 5px rgba(37,99,235,0.22),0 6px 14px rgba(15,23,42,0.28);"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9]
});

const dropoffIcon = L.divIcon({
    className: 'custom-map-pin',
    html: `<div style="width:18px;height:18px;background:#10b981;border:3px solid #ffffff;border-radius:5px;box-shadow:0 0 0 5px rgba(16,185,129,0.22),0 6px 14px rgba(15,23,42,0.28);"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9]
});

const MapViewportUpdater = ({ pickup, dropoff, routeCoords }) => {
    const map = useMap();

    useEffect(() => {
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
    }, [map, pickup, dropoff, routeCoords]);

    return null;
};

const MapPreview = () => {
    const { bookingData, updateBookingData } = useBooking();
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
            <div className="map-floating-hud">
                <div className="hud-brand">
                    <span className="brand-dot" />
                    <span>RELOQ</span>
                </div>
                {pickup?.lat && dropoff?.lat && routeInfo && (
                    <div className="hud-route-pill">
                        <span>{routeInfo.distanceMiles} mi</span>
                        <span className="hud-sep">•</span>
                        <span>~{routeInfo.durationMins} min</span>
                    </div>
                )}
            </div>

            <MapContainer
                center={DEFAULT_CENTER}
                zoom={13}
                style={{ width: '100%', height: '100%', backgroundColor: '#e2e8f0' }}
                zoomControl={false}
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                <MapViewportUpdater pickup={pickup} dropoff={dropoff} routeCoords={routeCoords} />

                {pickup?.lat && <Marker position={[pickup.lat, pickup.lng]} icon={pickupIcon} />}
                {dropoff?.lat && <Marker position={[dropoff.lat, dropoff.lng]} icon={dropoffIcon} />}

                {routeCoords.length > 0 && (
                    <>
                        <Polyline
                            positions={routeCoords}
                            pathOptions={{ color: '#2563eb', weight: 11, opacity: 0.2 }}
                        />
                        <Polyline
                            positions={routeCoords}
                            pathOptions={{ color: '#2563eb', weight: 4.5, opacity: 0.95 }}
                        />
                    </>
                )}
            </MapContainer>
        </div>
    );
};

export default MapPreview;