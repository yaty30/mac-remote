import { useEffect, useRef, useState } from "react";
import type { HostStateMessage } from "../../types/protocol";
import type { RemoteSocket } from "../../websocket/RemoteSocket";
import {
  BRIGHTNESS_SEND_DEBOUNCE_MS,
  DEFAULT_UNMUTE_VOLUME,
} from "./constants";
import { clampPercent, percentToStep, stepToPercent } from "./mediaUtils";

export function useHostMedia(
  socket: RemoteSocket,
  availability: {
    brightnessAvailable: boolean;
    volumeAvailable: boolean;
  },
) {
  const brightnessRef = useRef<number | null>(null);
  const brightnessCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const brightnessSlidingRef = useRef(false);
  const lastAudibleVolumeRef = useRef(DEFAULT_UNMUTE_VOLUME);
  const [brightness, setBrightness] = useState<number | null>(null);
  const [volume, setVolume] = useState<number | null>(null);

  const brightnessAdjustable = availability.brightnessAvailable;
  const volumeAdjustable = availability.volumeAvailable;
  const volumeStep = percentToStep(volume);
  const volumeMuted = volume === 0;
  const volumeButtonColor = volumeAdjustable ? "#ffffff" : "#5c554e";

  useEffect(
    () => () => {
      clearBrightnessCommitTimer();
    },
    [],
  );

  function applyHostState(message: HostStateMessage) {
    if (
      typeof message.brightness === "number" &&
      !brightnessSlidingRef.current
    ) {
      const nextBrightness = clampPercent(message.brightness);
      brightnessRef.current = nextBrightness;
      setBrightness(nextBrightness);
    }

    if (typeof message.volume === "number") {
      const nextVolume = clampPercent(message.volume);
      if (nextVolume > 0) {
        lastAudibleVolumeRef.current = nextVolume;
      }
      setVolume(nextVolume);
    }
  }

  function resetHostMedia() {
    clearBrightnessCommitTimer();
    brightnessSlidingRef.current = false;
    brightnessRef.current = null;
    setBrightness(null);
    setVolume(null);
    lastAudibleVolumeRef.current = DEFAULT_UNMUTE_VOLUME;
  }

  function handleBrightnessSlideStart() {
    if (!brightnessAdjustable) {
      return;
    }

    brightnessSlidingRef.current = true;
  }

  function handleBrightnessValueChange(value: number) {
    if (!brightnessAdjustable) {
      return;
    }

    const next = clampPercent(value);
    brightnessRef.current = next;
    setBrightness(next);
    scheduleBrightnessCommit(next);
  }

  function handleBrightnessSlideComplete(value: number) {
    if (!brightnessAdjustable) {
      return;
    }

    brightnessSlidingRef.current = false;
    commitBrightness(value);
  }

  function adjustVolumeStep(delta: -1 | 1) {
    if (!volumeAdjustable) {
      return;
    }

    const currentStep = percentToStep(volume);

    if (currentStep === null) {
      socket.requestHostState();
      return;
    }

    const next = stepToPercent(currentStep + delta);
    if (next > 0) {
      lastAudibleVolumeRef.current = next;
    }
    setVolume(next);
    socket.sendVolume(next);
  }

  function toggleMute() {
    if (!volumeAdjustable) {
      return;
    }

    if (volume === null) {
      socket.requestHostState();
      return;
    }

    if (volume > 0) {
      lastAudibleVolumeRef.current = volume;
      setVolume(0);
      socket.sendVolume(0);
      return;
    }

    const next = clampPercent(lastAudibleVolumeRef.current);
    lastAudibleVolumeRef.current = next > 0 ? next : DEFAULT_UNMUTE_VOLUME;
    setVolume(lastAudibleVolumeRef.current);
    socket.sendVolume(lastAudibleVolumeRef.current);
  }

  function scheduleBrightnessCommit(value: number) {
    clearBrightnessCommitTimer();
    brightnessCommitTimerRef.current = setTimeout(() => {
      commitBrightness(value);
    }, BRIGHTNESS_SEND_DEBOUNCE_MS);
  }

  function commitBrightness(value: number) {
    const next = clampPercent(value);
    clearBrightnessCommitTimer();
    brightnessRef.current = next;
    setBrightness(next);
    socket.setBrightness(next);
  }

  function clearBrightnessCommitTimer() {
    if (brightnessCommitTimerRef.current === null) {
      return;
    }

    clearTimeout(brightnessCommitTimerRef.current);
    brightnessCommitTimerRef.current = null;
  }

  return {
    adjustVolumeStep,
    applyHostState,
    brightness,
    brightnessAdjustable,
    clearBrightnessCommitTimer,
    handleBrightnessSlideComplete,
    handleBrightnessSlideStart,
    handleBrightnessValueChange,
    resetHostMedia,
    toggleMute,
    volume,
    volumeAdjustable,
    volumeButtonColor,
    volumeMuted,
    volumeStep,
  };
}
