import { registerPlugin } from '@capacitor/core';

export interface BatteryOptimizationPlugin {
  openBatterySettings(): Promise<{ success: boolean; fallback?: boolean }>;
  isIgnoringBatteryOptimizations(): Promise<{ isIgnoring: boolean }>;
}

const BatteryOptimization = registerPlugin<BatteryOptimizationPlugin>('BatteryOptimization');

export default BatteryOptimization;
