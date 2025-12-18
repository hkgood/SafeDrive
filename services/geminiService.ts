
import { GoogleGenAI } from "@google/genai";
import { DriveSummary, DrivingEventType } from "../types";

export const analyzeDrive = async (summary: DriveSummary): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  
  const eventCounts = summary.events.reduce((acc, event) => {
    acc[event.type] = (acc[event.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const prompt = `
    请作为一名专业的驾驶安全教练，分析以下这段驾驶数据并给出一个简短的评价和改进建议（200字以内）：
    
    驾驶总时长: ${Math.round((summary.endTime - summary.startTime) / 60000)} 分钟
    记录事件总数: ${summary.eventCount}
    急加速次数: ${eventCounts[DrivingEventType.HARSH_ACCELERATION] || 0}
    急减速次数: ${eventCounts[DrivingEventType.HARSH_BRAKING] || 0}
    横向剧烈摆动次数: ${eventCounts[DrivingEventType.LATERAL_DISCOMFORT] || 0}
    
    请用亲切、专业的口吻回答。
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return response.text || "分析暂时不可用。";
  } catch (error) {
    console.error("Gemini analysis error:", error);
    return "AI分析请求失败，请检查网络连接。";
  }
};
