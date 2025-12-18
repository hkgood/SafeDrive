
import React, { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap, CircleMarker } from 'react-leaflet';
import L from 'leaflet';
import { RoutePoint, DrivingEvent, DrivingEventType } from '../types';

// Fix for default marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Component to handle map centering and bounds
const MapController: React.FC<{ route: RoutePoint[], isRecording: boolean }> = ({ route, isRecording }) => {
  const map = useMap();

  useEffect(() => {
    if (route.length > 0) {
      const lastPoint = route[route.length - 1];
      const currentPos: L.LatLngExpression = [lastPoint.latitude, lastPoint.longitude];
      
      if (isRecording) {
        // Smoothly pan to the new position
        map.panTo(currentPos, { animate: true });
      } else {
        // If not recording (viewing summary), fit the entire route in view
        const bounds = L.latLngBounds(route.map(p => [p.latitude, p.longitude]));
        map.fitBounds(bounds, { padding: [20, 20] });
      }
    }
  }, [route, isRecording, map]);

  return null;
};

interface DriveMapProps {
  route: RoutePoint[];
  events: DrivingEvent[];
  isRecording: boolean;
}

const DriveMap: React.FC<DriveMapProps> = ({ route, events, isRecording }) => {
  // Memoize path positions to prevent unnecessary recalculations
  const pathPositions = useMemo(() => 
    route.map(p => [p.latitude, p.longitude] as [number, number]), 
  [route]);

  // Default center (Beijing) or the first route point
  const initialCenter: [number, number] = route.length > 0 
    ? [route[0].latitude, route[0].longitude] 
    : [39.9042, 116.4074];

  const getMarkerIcon = (type: DrivingEventType) => {
    let color = 'red';
    if (type === DrivingEventType.HARSH_ACCELERATION) color = 'orange';
    if (type === DrivingEventType.LATERAL_DISCOMFORT) color = 'blue';

    return new L.Icon({
      iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${color}.png`,
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41]
    });
  };

  return (
    <div className="w-full h-full min-h-[400px] relative">
      <MapContainer center={initialCenter} zoom={16} scrollWheelZoom={true}>
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        <MapController route={route} isRecording={isRecording} />

        {/* The Route Path */}
        {pathPositions.length > 1 && (
          <Polyline 
            key={`route-${pathPositions.length}`} // Force re-render as route grows
            positions={pathPositions} 
            color="#4f46e5" 
            weight={6} 
            opacity={0.8}
            lineJoin="round"
          />
        )}

        {/* Current Location Blue Dot */}
        {isRecording && route.length > 0 && (
          <CircleMarker 
            center={[route[route.length-1].latitude, route[route.length-1].longitude]}
            radius={8}
            pathOptions={{ fillColor: '#3b82f6', fillOpacity: 0.9, color: '#fff', weight: 2 }}
          >
            <Popup>您的当前位置</Popup>
          </CircleMarker>
        )}

        {/* Safety Events Pins */}
        {events.map(event => (
          <Marker 
            key={event.id} 
            position={[event.latitude, event.longitude]} 
            icon={getMarkerIcon(event.type)}
          >
            <Popup>
              <div className="p-1">
                <div className="font-bold text-slate-800">{event.description}</div>
                <div className="text-xs text-slate-500 mt-1">
                  时间: {new Date(event.timestamp).toLocaleTimeString()}
                </div>
                <div className="text-xs font-mono text-indigo-600 font-bold">
                  强度: {Math.abs(event.magnitude).toFixed(2)} m/s²
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
      
      {!isRecording && route.length === 0 && (
        <div className="absolute inset-0 z-[1001] bg-slate-50/50 flex items-center justify-center pointer-events-none">
          <p className="text-slate-400 font-medium">等待地理位置信号...</p>
        </div>
      )}
    </div>
  );
};

export default DriveMap;
