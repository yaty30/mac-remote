import { Key } from "@nut-tree-fork/nut-js";
import type { KeyboardController } from "../mouse-control/keyboardController";
import type { HostCapabilities, ShortcutId, TextCommand } from "../types/protocol";
import { clampPercent, runExecutable } from "./processUtils";
import type {
  DisplayContext,
  DisplayControlCapabilities,
  HostAdapter,
} from "./types";

const BRIGHTNESS_CONTROL_STEPS = 16;

const SHORTCUT_URLS: Record<ShortcutId, string> = {
  netflix: "https://www.netflix.com",
  disney: "https://www.disneyplus.com",
  amazon: "https://www.primevideo.com",
  youtube: "https://www.youtube.com",
  spotify: "https://open.spotify.com",
};

export class WindowsHostAdapter implements HostAdapter {
  readonly platform = "win32" as const;

  constructor(private readonly keyboardController: KeyboardController) {}

  getDisplayControlCapabilities(
    context: DisplayContext,
  ): DisplayControlCapabilities {
    return {
      brightnessAdjustable: context.display.internal && !context.info.isTv,
      volumeAdjustable: !context.info.isTv,
    };
  }

  getCapabilities(display: {
    brightnessAdjustable: boolean;
    volumeAdjustable: boolean;
  }): HostCapabilities {
    return {
      brightness: display.brightnessAdjustable,
      volume: display.volumeAdjustable,
      switchWorkspace: true,
      switchWindow: true,
      showOverview: true,
      sleep: true,
      restart: true,
    };
  }

  async getDisplayBrightness(): Promise<number | undefined> {
    try {
      const output = await runPowerShell(`
        $brightness = Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness -ErrorAction Stop |
          Select-Object -First 1 -ExpandProperty CurrentBrightness
        if ($null -ne $brightness) { [int]$brightness }
      `);
      const value = Number.parseInt(output.trim(), 10);

      return Number.isFinite(value) ? clampPercent(value) : undefined;
    } catch (error) {
      if (!isUnsupportedWmiBrightnessError(error)) {
        console.warn("[windows-host] failed to read display brightness", error);
      }
      return undefined;
    }
  }

  async adjustBrightness(delta: -1 | 1): Promise<void> {
    const currentBrightness = await this.getDisplayBrightness();

    if (currentBrightness === undefined) {
      return;
    }

    await this.setBrightness(getSteppedBrightnessTarget(currentBrightness, delta));
  }

  async setBrightness(value: number): Promise<void> {
    const target = clampPercent(value);

    try {
      await runPowerShell(`
        $methods = Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods -ErrorAction Stop
        foreach ($method in $methods) {
          Invoke-CimMethod -InputObject $method -MethodName WmiSetBrightness -Arguments @{ Timeout = 1; Brightness = ${target} } | Out-Null
        }
      `);
    } catch (error) {
      if (isUnsupportedWmiBrightnessError(error)) {
        return;
      }

      throw error;
    }
  }

  async getOutputVolume(): Promise<number | undefined> {
    try {
      const output = await runPowerShell(`
        ${WINDOWS_AUDIO_HELPER}
        [RemoteControlAudio]::GetVolume()
      `);
      const volume = Number.parseInt(output.trim(), 10);

      return Number.isFinite(volume) ? clampPercent(volume) : undefined;
    } catch (error) {
      console.warn("[windows-host] failed to read output volume", error);
      return undefined;
    }
  }

  async setVolume(value: number): Promise<void> {
    await runPowerShell(`
      ${WINDOWS_AUDIO_HELPER}
      [RemoteControlAudio]::SetVolume(${clampPercent(value)})
    `);
  }

  async textCommand(command: TextCommand): Promise<void> {
    await this.keyboardController.textCommand(command, {
      browser: Key.LeftAlt,
      command: Key.LeftControl,
    });
  }

  async zoom(direction: "in" | "out"): Promise<void> {
    await this.keyboardController.zoom(direction, Key.LeftControl);
  }

  async switchWorkspace(direction: "left" | "right"): Promise<void> {
    const arrow = direction === "left" ? Key.Left : Key.Right;

    await this.keyboardController.pressAndRelease(
      Key.LeftWin,
      Key.LeftControl,
      arrow,
    );
  }

  async switchWindow(direction: "next" | "previous"): Promise<void> {
    if (direction === "previous") {
      await this.keyboardController.holdAndPress(
        [Key.LeftAlt, Key.LeftShift],
        Key.Tab,
      );
      return;
    }

    await this.keyboardController.holdAndPress([Key.LeftAlt], Key.Tab);
  }

  async showOverview(): Promise<void> {
    await this.keyboardController.pressAndRelease(Key.LeftWin, Key.Tab);
  }

  async runWebsiteShortcut(url: string): Promise<void> {
    await openWindowsTarget(url);
  }

  async runShortcut(shortcut: ShortcutId): Promise<void> {
    await openWindowsTarget(SHORTCUT_URLS[shortcut]);
  }

  async sleep(): Promise<void> {
    await runExecutable("rundll32.exe", [
      "powrprof.dll,SetSuspendState",
      "Sleep",
    ]);
  }

  async restartHost(): Promise<void> {
    await runExecutable("shutdown.exe", ["/r", "/t", "0"]);
  }
}

function getSteppedBrightnessTarget(
  currentBrightness: number,
  delta: -1 | 1,
): number {
  const currentStep = Math.max(
    0,
    Math.min(
      BRIGHTNESS_CONTROL_STEPS,
      Math.round((currentBrightness / 100) * BRIGHTNESS_CONTROL_STEPS),
    ),
  );
  const nextStep = Math.max(
    0,
    Math.min(BRIGHTNESS_CONTROL_STEPS, currentStep + delta),
  );

  return Math.round((nextStep / BRIGHTNESS_CONTROL_STEPS) * 100);
}

function openWindowsTarget(target: string): Promise<void> {
  return runPowerShell(`Start-Process -FilePath '${escapePowerShell(target)}'`)
    .then(() => undefined);
}

function runPowerShell(script: string): Promise<string> {
  return runExecutable("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    script,
  ]);
}

function isUnsupportedWmiBrightnessError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";

  return (
    message.includes("WmiMonitorBrightness") &&
    (message.includes("HRESULT 0x8004100c") ||
      message.includes("NotImplemented"))
  );
}

function escapePowerShell(value: string): string {
  return value.replace(/'/g, "''");
}

const WINDOWS_AUDIO_HELPER = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

[ComImport]
[Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
internal class MMDeviceEnumerator {}

internal enum EDataFlow { eRender = 0, eCapture = 1, eAll = 2 }
internal enum ERole { eConsole = 0, eMultimedia = 1, eCommunications = 2 }

[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IMMDeviceEnumerator {
  int NotImpl1();
  [PreserveSig]
  int GetDefaultAudioEndpoint(EDataFlow dataFlow, ERole role, out IMMDevice endpoint);
}

[Guid("D666063F-1587-4E43-81F1-B948E807363F")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IMMDevice {
  [PreserveSig]
  int Activate(ref Guid iid, int clsCtx, IntPtr activationParams, out IAudioEndpointVolume volume);
}

[Guid("5CDF2C82-841E-4546-9722-0CF74078229A")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IAudioEndpointVolume {
  int RegisterControlChangeNotify(IntPtr notify);
  int UnregisterControlChangeNotify(IntPtr notify);
  int GetChannelCount(out uint channelCount);
  int SetMasterVolumeLevel(float levelDb, Guid eventContext);
  int SetMasterVolumeLevelScalar(float level, Guid eventContext);
  int GetMasterVolumeLevel(out float levelDb);
  int GetMasterVolumeLevelScalar(out float level);
  int SetChannelVolumeLevel(uint channel, float levelDb, Guid eventContext);
  int SetChannelVolumeLevelScalar(uint channel, float level, Guid eventContext);
  int GetChannelVolumeLevel(uint channel, out float levelDb);
  int GetChannelVolumeLevelScalar(uint channel, out float level);
  int SetMute(bool mute, Guid eventContext);
  int GetMute(out bool mute);
  int GetVolumeStepInfo(out uint step, out uint stepCount);
  int VolumeStepUp(Guid eventContext);
  int VolumeStepDown(Guid eventContext);
  int QueryHardwareSupport(out uint hardwareSupportMask);
  int GetVolumeRange(out float volumeMinDb, out float volumeMaxDb, out float volumeIncrementDb);
}

public static class RemoteControlAudio {
  private static IAudioEndpointVolume GetEndpointVolume() {
    IMMDeviceEnumerator enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumerator());
    IMMDevice device;
    Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(EDataFlow.eRender, ERole.eMultimedia, out device));
    Guid iid = typeof(IAudioEndpointVolume).GUID;
    IAudioEndpointVolume volume;
    Marshal.ThrowExceptionForHR(device.Activate(ref iid, 23, IntPtr.Zero, out volume));
    return volume;
  }

  public static int GetVolume() {
    float level;
    Marshal.ThrowExceptionForHR(GetEndpointVolume().GetMasterVolumeLevelScalar(out level));
    return Math.Max(0, Math.Min(100, (int)Math.Round(level * 100)));
  }

  public static void SetVolume(int percent) {
    float level = Math.Max(0, Math.Min(100, percent)) / 100.0f;
    Marshal.ThrowExceptionForHR(GetEndpointVolume().SetMasterVolumeLevelScalar(level, Guid.Empty));
  }
}
"@
`;
