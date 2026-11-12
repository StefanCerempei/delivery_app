import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useBooking } from '../context/BookingContext';
import Logo from './Logo';

const DEFAULT_CENTER = [37.7749, -122.4194]; // San Francisco

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

            <MapContainer
                center={DEFAULT_CENTER}
                zoom={13}
                style={{ width: '100%', height: '100%', backgroundColor: '#0b111b' }}
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

export default MapPreview;