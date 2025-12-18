
export enum DrivingEventType {
  HARSH_BRAKING = 'HARSH_BRAKING',
  HARSH_ACCELERATION = 'HARSH_ACCELERATION',
  LATERAL_DISCOMFORT = 'LATERAL_DISCOMFORT'
}

export interface DrivingEvent {
  id: string;
  type: DrivingEventType;
  timestamp: number;
  latitude: number;
  longitude: number;
  magnitude: number;
  description: string;
}

export interface RoutePoint {
  latitude: number;
  longitude: number;
  timestamp: number;
  speed: number | null;
}

export interface CalibrationData {
  gravityVector: { x: number; y: number; z: number };
  isCalibrated: boolean;
}

export interface DriveSummary {
  startTime: number;
  endTime: number;
  distance: number;
  eventCount: number;
  events: DrivingEvent[];
  route: RoutePoint[];
  aiAnalysis?: string;
}
