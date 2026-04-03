import { useQuery } from "@tanstack/react-query";
import {
  fetchHealth,
  fetchPipeline,
  fetchPerformance,
  fetchVolume,
  fetchPresence,
  type HealthData,
  type PipelineData,
  type PerformanceData,
  type VolumeData,
  type PresenceData,
} from "../lib/api";

export function useHealth() {
  return useQuery<HealthData>({
    queryKey: ["diag", "health"],
    queryFn: fetchHealth,
  });
}

export function usePipeline() {
  return useQuery<PipelineData>({
    queryKey: ["diag", "pipeline"],
    queryFn: fetchPipeline,
  });
}

export function usePerformance() {
  return useQuery<PerformanceData>({
    queryKey: ["diag", "performance"],
    queryFn: fetchPerformance,
  });
}

export function useVolume() {
  return useQuery<VolumeData>({
    queryKey: ["diag", "volume"],
    queryFn: fetchVolume,
  });
}

export function usePresence() {
  return useQuery<PresenceData>({
    queryKey: ["diag", "presence"],
    queryFn: fetchPresence,
  });
}
