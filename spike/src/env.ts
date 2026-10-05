import * as Device from 'expo-device';
import * as Network from 'expo-network';
import * as Cellular from 'expo-cellular';
import { Platform } from 'react-native';
import type { DeviceInfo, NetworkInfo } from './types';

export function deviceInfo(): DeviceInfo {
  return {
    platform: `${Platform.OS} ${Platform.Version}`,
    model: Device.modelName,
    os: Device.osVersion,
    manufacturer: Device.manufacturer,
  };
}

const GEN: Record<number, string> = { 0: 'unknown', 1: '2G', 2: '3G', 3: '4G', 4: '5G' };

export async function networkInfo(): Promise<NetworkInfo> {
  let type = 'UNKNOWN';
  try {
    const s = await Network.getNetworkStateAsync();
    type = String(s.type ?? 'UNKNOWN');
  } catch {}
  let cellular: string | null = null;
  let carrier: string | null = null;
  let isoCountry: string | null = null;
  try {
    cellular = GEN[await Cellular.getCellularGenerationAsync()] ?? null;
    carrier = await Cellular.getCarrierNameAsync();
    isoCountry = await Cellular.getIsoCountryCodeAsync();
  } catch {}
  return { type, cellular, carrier, isoCountry };
}
