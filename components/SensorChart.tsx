
import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { SENSOR_THRESHOLDS } from '../constants';

interface SensorChartProps {
  data: { time: number; longitudinal: number; lateral: number }[] | any[];
}

const SensorChart: React.FC<SensorChartProps> = ({ data }) => {
  return (
    <div className="h-64 w-full bg-white p-4 rounded-xl shadow-sm">
      <h3 className="text-sm font-semibold text-gray-500 mb-4 uppercase tracking-wider">动态加速度 (m/s²)</h3>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
          <XAxis dataKey="time" hide />
          <YAxis domain={[-6, 6]} fontSize={10} />
          <Tooltip 
             contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
             labelStyle={{ display: 'none' }}
          />
          <ReferenceLine y={SENSOR_THRESHOLDS.HARSH_ACCELERATION} stroke="#f97316" strokeDasharray="3 3" label={{ position: 'right', value: '加速阈值', fontSize: 10, fill: '#f97316' }} />
          <ReferenceLine y={SENSOR_THRESHOLDS.HARSH_BRAKING} stroke="#ef4444" strokeDasharray="3 3" label={{ position: 'right', value: '制动阈值', fontSize: 10, fill: '#ef4444' }} />
          <Line 
            type="monotone" 
            dataKey="longitudinal" 
            stroke="#4f46e5" 
            strokeWidth={2} 
            dot={false} 
            isAnimationActive={false} 
            name="纵向 (前后)"
          />
          <Line 
            type="monotone" 
            dataKey="lateral" 
            stroke="#10b981" 
            strokeWidth={2} 
            dot={false} 
            isAnimationActive={false} 
            name="横向 (左右)"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default SensorChart;
