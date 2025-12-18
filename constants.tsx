
import React from 'react';
import { AlertCircle, ArrowUp, ArrowDown, MoveHorizontal } from 'lucide-react';
import { DrivingEventType } from './types';

export const SENSOR_THRESHOLDS = {
  HARSH_BRAKING: -2.5,      // 降低绝对值，提高敏感度 (m/s^2)
  HARSH_ACCELERATION: 3.8,   // 提高阈值，降低敏感度 (m/s^2)
  LATERAL_DISCOMFORT: 2.2,   // 降低阈值，显著提高横向敏感度 (m/s^2)
};

export const EVENT_METADATA = {
  [DrivingEventType.HARSH_BRAKING]: {
    label: '急减速',
    color: 'text-red-600',
    bgColor: 'bg-red-100',
    icon: <ArrowDown className="w-5 h-5" />,
    description: '检测到剧烈的刹车行为。'
  },
  [DrivingEventType.HARSH_ACCELERATION]: {
    label: '急加速',
    color: 'text-orange-600',
    bgColor: 'bg-orange-100',
    icon: <ArrowUp className="w-5 h-5" />,
    description: '检测到剧烈的起步或加速。'
  },
  [DrivingEventType.LATERAL_DISCOMFORT]: {
    label: '横向摆动',
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
    icon: <MoveHorizontal className="w-5 h-5" />,
    description: '检测到剧烈的变道或过弯。'
  }
};
