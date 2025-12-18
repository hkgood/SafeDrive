
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  ShieldCheck, 
  Play, 
  Square, 
  Settings, 
  History, 
  Gauge, 
  Map as MapIcon, 
  Navigation,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Info
} from 'lucide-react';
import { 
  DrivingEvent, 
  DrivingEventType, 
  RoutePoint, 
  CalibrationData, 
  DriveSummary 
} from './types';
import { SENSOR_THRESHOLDS, EVENT_METADATA } from './constants';
import DriveMap from './components/DriveMap';
import SensorChart from './components/SensorChart';
import { analyzeDrive } from './services/geminiService';

const App: React.FC = () => {
  // State
  const [isRecording, setIsRecording] = useState(false);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibration, setCalibration] = useState<CalibrationData>({
    gravityVector: { x: 0, y: 0, z: 0 },
    isCalibrated: false
  });
  const [route, setRoute] = useState<RoutePoint[]>([]);
  const [events, setEvents] = useState<DrivingEvent[]>([]);
  const [currentG, setCurrentG] = useState({ longitudinal: 0, lateral: 0 });
  const [chartData, setChartData] = useState<{ time: number; longitudinal: number; lateral: number }[]>([]);
  const [summary, setSummary] = useState<DriveSummary | null>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'map' | 'summary'>('dashboard');

  // Refs
  const routeRef = useRef<RoutePoint[]>([]);
  const eventsRef = useRef<DrivingEvent[]>([]);
  const calibrationRef = useRef<CalibrationData>(calibration);
  const lastEventTimeRef = useRef<number>(0);
  
  // Smoothing EMA
  const filterFactor = 0.15; // Slightly smoother
  const smoothedLongRef = useRef<number>(0);
  const smoothedLatRef = useRef<number>(0);

  // Constants
  const MIN_EVENT_INTERVAL = 1500;

  // Handle Calibration
  const startCalibration = async () => {
    setIsCalibrating(true);
    let samples: { x: number; y: number; z: number }[] = [];
    
    const onMotion = (e: DeviceMotionEvent) => {
      if (e.accelerationIncludingGravity) {
        samples.push({
          x: e.accelerationIncludingGravity.x || 0,
          y: e.accelerationIncludingGravity.y || 0,
          z: e.accelerationIncludingGravity.z || 0
        });
      }
    };

    window.addEventListener('devicemotion', onMotion);

    setTimeout(() => {
      window.removeEventListener('devicemotion', onMotion);
      
      if (samples.length > 0) {
        const avg = samples.reduce((acc, s) => ({
          x: acc.x + s.x / samples.length,
          y: acc.y + s.y / samples.length,
          z: acc.z + s.z / samples.length
        }), { x: 0, y: 0, z: 0 });

        const newCalib = { gravityVector: avg, isCalibrated: true };
        setCalibration(newCalib);
        calibrationRef.current = newCalib;
        setIsCalibrating(false);
        startDrive();
      } else {
        alert("未检测到传感器数据。请在移动端使用并确保开启权限。");
        setIsCalibrating(false);
      }
    }, 2000);
  };

  const startDrive = () => {
    // Attempt to get initial location immediately
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const firstPoint = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            timestamp: pos.timestamp,
            speed: pos.coords.speed
          };
          setRoute([firstPoint]);
          routeRef.current = [firstPoint];
        },
        (err) => console.warn("Initial location failed", err),
        { enableHighAccuracy: true }
      );
    }

    setIsRecording(true);
    setEvents([]);
    setChartData([]);
    eventsRef.current = [];
    smoothedLongRef.current = 0;
    smoothedLatRef.current = 0;
    setSummary(null);
    setActiveTab('dashboard');
  };

  const stopDrive = async () => {
    setIsRecording(false);
    const endTime = Date.now();
    const finalSummary: DriveSummary = {
      startTime: routeRef.current[0]?.timestamp || Date.now(),
      endTime,
      distance: 0, 
      eventCount: eventsRef.current.length,
      events: [...eventsRef.current],
      route: [...routeRef.current],
    };

    setSummary(finalSummary);
    setActiveTab('summary');

    const feedback = await analyzeDrive(finalSummary);
    setSummary(prev => prev ? { ...prev, aiAnalysis: feedback } : null);
  };

  // Combined Processing Logic
  useEffect(() => {
    if (!isRecording || !calibration.isCalibrated) return;

    let watchId: number;

    const onMotion = (e: DeviceMotionEvent) => {
      const acc = e.accelerationIncludingGravity;
      if (!acc) return;

      const gv = calibrationRef.current.gravityVector;
      const gMag = Math.sqrt(gv.x**2 + gv.y**2 + gv.z**2);
      const uv = { x: gv.x / gMag, y: gv.y / gMag, z: gv.z / gMag };
      const raw = { x: acc.x || 0, y: acc.y || 0, z: acc.z || 0 };
      const dot = raw.x * uv.x + raw.y * uv.y + raw.z * uv.z;
      
      const hx = raw.x - dot * uv.x;
      const hy = raw.y - dot * uv.y;
      
      smoothedLongRef.current = smoothedLongRef.current * (1 - filterFactor) + hy * filterFactor;
      smoothedLatRef.current = smoothedLatRef.current * (1 - filterFactor) + hx * filterFactor;

      const lateral = smoothedLatRef.current;
      const longitudinal = smoothedLongRef.current;

      setCurrentG({ longitudinal, lateral });
      
      // Update chart samples
      if (Math.random() > 0.6) {
        setChartData(prev => [...prev.slice(-39), { time: Date.now(), longitudinal, lateral }]);
      }

      // Detect Safety Events
      const now = Date.now();
      if (now - lastEventTimeRef.current > MIN_EVENT_INTERVAL) {
        let eventType: DrivingEventType | null = null;
        let desc = "";

        if (longitudinal < SENSOR_THRESHOLDS.HARSH_BRAKING) {
          eventType = DrivingEventType.HARSH_BRAKING;
          desc = "检测到急刹车";
        } else if (longitudinal > SENSOR_THRESHOLDS.HARSH_ACCELERATION) {
          eventType = DrivingEventType.HARSH_ACCELERATION;
          desc = "检测到急加速";
        } else if (Math.abs(lateral) > SENSOR_THRESHOLDS.LATERAL_DISCOMFORT) {
          eventType = DrivingEventType.LATERAL_DISCOMFORT;
          desc = "检测到横向摆动";
        }

        if (eventType && routeRef.current.length > 0) {
          const lastPos = routeRef.current[routeRef.current.length - 1];
          const newEvent: DrivingEvent = {
            id: Math.random().toString(36).substr(2, 9),
            type: eventType,
            timestamp: now,
            latitude: lastPos.latitude,
            longitude: lastPos.longitude,
            magnitude: eventType === DrivingEventType.LATERAL_DISCOMFORT ? lateral : longitudinal,
            description: desc
          };
          setEvents(prev => [...prev, newEvent]);
          eventsRef.current.push(newEvent);
          lastEventTimeRef.current = now;
        }
      }
    };

    if ("geolocation" in navigator) {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const newPoint: RoutePoint = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            timestamp: pos.timestamp,
            speed: pos.coords.speed
          };
          // Use functional update to ensure we have the latest route state
          setRoute(prev => {
            // Prevent adding identical coordinates in short time to reduce clutter
            if (prev.length > 0) {
              const last = prev[prev.length - 1];
              if (last.latitude === newPoint.latitude && last.longitude === newPoint.longitude) {
                return prev;
              }
            }
            const updated = [...prev, newPoint];
            routeRef.current = updated;
            return updated;
          });
        },
        (err) => console.error("GPS Watch error:", err),
        { 
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0 
        }
      );
    }

    window.addEventListener('devicemotion', onMotion);
    return () => {
      window.removeEventListener('devicemotion', onMotion);
      if (watchId) navigator.geolocation.clearWatch(watchId);
    };
  }, [isRecording, calibration.isCalibrated]);

  const handleStartClick = () => {
    if (typeof (DeviceMotionEvent as any).requestPermission === 'function') {
      (DeviceMotionEvent as any).requestPermission()
        .then((permissionState: string) => {
          if (permissionState === 'granted') {
            startCalibration();
          }
        })
        .catch(console.error);
    } else {
      startCalibration();
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 text-slate-900 font-sans">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2">
          <div className="bg-indigo-600 p-2 rounded-lg shadow-inner">
            <ShieldCheck className="text-white w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-slate-800">SafeDrive</h1>
            <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">智能安全护航</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isRecording && (
            <span className="flex items-center gap-1.5 px-3 py-1 bg-red-50 text-red-600 rounded-full text-xs font-black animate-pulse border border-red-100">
              <span className="w-1.5 h-1.5 bg-red-600 rounded-full"></span>
              REC
            </span>
          )}
          {!isRecording && calibration.isCalibrated && (
            <button 
              onClick={() => setCalibration({ ...calibration, isCalibrated: false })}
              className="p-2 hover:bg-slate-100 rounded-full transition-colors"
            >
              <RefreshCw className="w-5 h-5 text-slate-400" />
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 md:p-6 max-w-4xl mx-auto w-full space-y-6">
        {!isRecording && !summary && (
          <div className="bg-white rounded-3xl shadow-xl p-10 text-center space-y-8 border border-slate-100">
            <div className="relative w-24 h-24 mx-auto">
               <div className="absolute inset-0 bg-indigo-50 rounded-full animate-ping opacity-20"></div>
               <div className="relative w-24 h-24 bg-indigo-50 rounded-full flex items-center justify-center">
                 <Navigation className="w-12 h-12 text-indigo-600" />
               </div>
            </div>
            
            <div className="space-y-3">
              <h2 className="text-3xl font-black text-slate-800">准备出发了吗？</h2>
              <p className="text-slate-500 max-w-sm mx-auto leading-relaxed">
                SafeDrive 使用高精度 GPS 和陀螺仪监测您的行驶状态。请确保手机稳固安装在支架上。
              </p>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-left">
                <Gauge className="w-5 h-5 text-indigo-500 mb-2" />
                <p className="text-sm font-bold text-slate-700">运动追踪</p>
                <p className="text-[10px] text-slate-400 uppercase font-bold">加速/制动</p>
              </div>
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-left">
                <MapIcon className="w-5 h-5 text-indigo-500 mb-2" />
                <p className="text-sm font-bold text-slate-700">轨迹地图</p>
                <p className="text-[10px] text-slate-400 uppercase font-bold">全程坐标记录</p>
              </div>
            </div>

            <button 
              onClick={handleStartClick}
              disabled={isCalibrating}
              className={`w-full py-5 rounded-2xl flex items-center justify-center gap-3 text-xl font-black shadow-xl transition-all active:scale-95
                ${isCalibrating ? 'bg-slate-100 text-slate-400' : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200'}`}
            >
              {isCalibrating ? (
                <>
                  <RefreshCw className="w-6 h-6 animate-spin" />
                  识别重力方向...
                </>
              ) : (
                <>
                  <Play className="w-6 h-6 fill-current" />
                  开启智能监控
                </>
              )}
            </button>
          </div>
        )}

        {isRecording && (
          <div className="space-y-6">
            <div className="flex p-1 bg-slate-200/50 rounded-2xl backdrop-blur-sm">
              <button 
                onClick={() => setActiveTab('dashboard')}
                className={`flex-1 py-3 rounded-xl text-sm font-black transition-all ${activeTab === 'dashboard' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}
              >
                仪表盘
              </button>
              <button 
                onClick={() => setActiveTab('map')}
                className={`flex-1 py-3 rounded-xl text-sm font-black transition-all ${activeTab === 'map' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}
              >
                实时地图
              </button>
            </div>

            {activeTab === 'dashboard' ? (
              <div className="space-y-6 animate-in fade-in duration-500">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                    <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-2">安全预警</p>
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-black text-indigo-600">{events.length}</span>
                      <span className="text-xs font-bold text-slate-400">次触发</span>
                    </div>
                  </div>
                  <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                    <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-2">GPS 车速</p>
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-black text-emerald-600">
                        {route.length > 0 ? Math.round((route[route.length - 1].speed || 0) * 3.6) : 0}
                      </span>
                      <span className="text-xs font-bold text-slate-400">km/h</span>
                    </div>
                  </div>
                </div>

                <SensorChart data={chartData} />

                <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                  <div className="p-5 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
                    <h3 className="font-black text-slate-700 text-sm">驾驶日志</h3>
                    <div className="flex items-center gap-1">
                       <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                       <span className="text-[10px] font-bold text-slate-400 uppercase">监测中</span>
                    </div>
                  </div>
                  <div className="max-h-72 overflow-y-auto">
                    {events.length === 0 ? (
                      <div className="py-16 text-center text-slate-400">
                        <CheckCircle2 className="w-12 h-12 mx-auto mb-4 text-emerald-100" />
                        <p className="text-sm font-medium">驾驶平稳，目前非常安全</p>
                      </div>
                    ) : (
                      events.slice().reverse().map((event) => {
                        const meta = EVENT_METADATA[event.type];
                        return (
                          <div key={event.id} className="p-5 flex items-center gap-4 border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors">
                            <div className={`p-3 rounded-2xl ${meta.bgColor} ${meta.color}`}>
                              {meta.icon}
                            </div>
                            <div className="flex-1">
                              <p className="font-black text-slate-800 text-sm">{meta.label}</p>
                              <p className="text-[10px] font-bold text-slate-400 uppercase">{new Date(event.timestamp).toLocaleTimeString()}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-[10px] font-black text-slate-400 uppercase mb-1">重力感应</p>
                              <p className={`text-sm font-mono font-black ${meta.color}`}>{Math.abs(event.magnitude).toFixed(2)}</p>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-[500px] bg-white rounded-3xl shadow-xl overflow-hidden border-4 border-white relative animate-in slide-in-from-bottom duration-500">
                <DriveMap route={route} events={events} isRecording={true} />
              </div>
            )}

            <button 
              onClick={stopDrive}
              className="w-full py-5 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl flex items-center justify-center gap-3 text-lg font-black shadow-2xl transition-all"
            >
              <Square className="w-5 h-5 fill-current text-red-500" />
              停止记录
            </button>
          </div>
        )}

        {!isRecording && summary && (
          <div className="space-y-6 animate-in zoom-in-95 duration-500">
            <div className="bg-white rounded-[2rem] shadow-2xl overflow-hidden border border-slate-100">
              <div className="bg-indigo-600 p-10 text-white text-center">
                <p className="text-indigo-200 text-xs font-black uppercase tracking-[0.2em] mb-3">安全驾驶分析</p>
                <h2 className="text-5xl font-black mb-6">行程报告</h2>
                <div className="flex justify-center gap-12">
                  <div className="text-center">
                    <p className="text-[10px] text-indigo-200 font-black uppercase mb-1">时长</p>
                    <p className="text-2xl font-black">{Math.round((summary.endTime - summary.startTime) / 60000)}<span className="text-xs ml-1 opacity-60">MIN</span></p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-indigo-200 font-black uppercase mb-1">评分</p>
                    <p className="text-2xl font-black">{Math.max(0, 100 - summary.eventCount * 5)}<span className="text-xs ml-1 opacity-60">分</span></p>
                  </div>
                </div>
              </div>

              <div className="p-8 space-y-8">
                <div className="bg-indigo-50/50 rounded-3xl p-6 border border-indigo-100/50 relative">
                   <div className="absolute -top-3 left-6 bg-indigo-600 text-white text-[10px] font-black px-3 py-1 rounded-full uppercase">Gemini AI Coach</div>
                   {summary.aiAnalysis ? (
                    <p className="text-slate-700 leading-relaxed font-medium">"{summary.aiAnalysis}"</p>
                  ) : (
                    <div className="flex items-center gap-3 text-indigo-400 py-2">
                      <RefreshCw className="w-5 h-5 animate-spin" />
                      正在通过 AI 评估驾驶行为...
                    </div>
                  )}
                </div>

                <div className="h-72 rounded-3xl overflow-hidden border-4 border-slate-50 shadow-inner">
                  <DriveMap route={summary.route} events={summary.events} isRecording={false} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {Object.values(DrivingEventType).map(type => {
                    const meta = EVENT_METADATA[type];
                    const count = summary.events.filter(e => e.type === type).length;
                    return (
                      <div key={type} className="p-5 rounded-2xl border border-slate-100 flex items-center gap-4 bg-slate-50/30">
                        <div className={`p-3 rounded-xl ${meta.bgColor} ${meta.color}`}>
                          {meta.icon}
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400 font-black uppercase mb-0.5">{meta.label}</p>
                          <p className="text-2xl font-black text-slate-800">{count}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="p-8 bg-slate-50 flex gap-4">
                <button 
                  onClick={() => {
                    setSummary(null);
                    setCalibration({ ...calibration, isCalibrated: false });
                  }}
                  className="flex-1 py-4 bg-white border border-slate-200 text-slate-700 font-black rounded-2xl shadow-sm hover:bg-slate-100 transition-all active:scale-95"
                >
                  开启新行程
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {!isRecording && isCalibrating && (
        <div className="fixed inset-0 z-50 bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-8">
          <div className="bg-white rounded-[2.5rem] p-10 max-w-sm w-full text-center space-y-8 shadow-2xl">
            <div className="relative w-32 h-32 mx-auto">
              <div className="absolute inset-0 border-8 border-indigo-50 rounded-full"></div>
              <div className="absolute inset-0 border-8 border-indigo-600 rounded-full border-t-transparent animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <RefreshCw className="w-12 h-12 text-indigo-600" />
              </div>
            </div>
            <div className="space-y-3">
              <h3 className="text-2xl font-black text-slate-900">环境校准中</h3>
              <p className="text-slate-500 text-sm leading-relaxed">
                算法正在通过重力场对齐传感器坐标系。<br/>
                <span className="font-bold text-indigo-600">请保持车辆静止，不要起步。</span>
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
