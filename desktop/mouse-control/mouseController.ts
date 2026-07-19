import {
  spawn,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import { Button, Point, mouse, screen } from "@nut-tree-fork/nut-js";
import type { HostPlatform } from "../types/protocol";

const EDGE_PRESSURE_ZONE = 6;
const EDGE_RELEASE_DISTANCE = 24;
const MAC_POINTER_GAIN = 1.8;
const MAC_POINTER_FRAME_MS = 4;
const MAC_POINTER_IDLE_RESET_MS = 150;
const WINDOWS_POINTER_FRAME_MS = 8;
const WINDOWS_POINTER_IDLE_RESET_MS = 250;
const WINDOWS_POINTER_ACCELERATION_START = 3;
const WINDOWS_POINTER_ACCELERATION_MAX = 2.25;
const WINDOWS_POINTER_ACCELERATION_DISTANCE = 28;
const WINDOWS_POINTER_FLUSH_TIMEOUT_MS = 80;
const WINDOWS_POINTER_MIN_SMOOTH_MS = 4;
const WINDOWS_POINTER_MAX_SMOOTH_MS = 14;
const WINDOWS_POINTER_DEFAULT_SMOOTH_MS = 8;
const SCREEN_SIZE_CACHE_MS = 1000;
const SCROLL_AXIS_DEADZONE_RATIO = 0.35;

type VerticalEdgeLock = "top" | "bottom" | null;

export class MouseController {
  private scrollAccumX = 0;
  private scrollAccumY = 0;
  private macPendingDx = 0;
  private macPendingDy = 0;
  private macRemainderX = 0;
  private macRemainderY = 0;
  private macPointerTimer: ReturnType<typeof setTimeout> | null = null;
  private macPointerFlush: Promise<void> = Promise.resolve();
  private macVirtualPosition: Point | null = null;
  private macLastPointerFlushAt = 0;
  private windowsPendingDx = 0;
  private windowsPendingDy = 0;
  private windowsPointerTimer: ReturnType<typeof setTimeout> | null = null;
  private windowsPointerFlush: Promise<void> = Promise.resolve();
  private windowsVirtualPosition: Point | null = null;
  private windowsLastPointerFlushAt = 0;
  private readonly windowsRelativePointer: WindowsRelativePointerInput | null;
  private screenSizeCache:
    | { width: number; height: number; readAt: number }
    | null = null;
  private verticalEdgeLock: VerticalEdgeLock = null;
  private verticalEdgeReleaseDistance = 0;

  constructor(private readonly platform: HostPlatform) {
    mouse.config.autoDelayMs = 0;
    mouse.config.mouseSpeed = 32000;
    this.windowsRelativePointer =
      platform === "win32" ? new WindowsRelativePointerInput() : null;
  }

  async moveRelative(dx: number, dy: number): Promise<void> {
    if (this.platform === "darwin") {
      this.queueMacPointerMove(dx, dy);
      return;
    }

    if (this.platform === "win32") {
      const scaled = this.scaleWindowsPointerDelta(dx, dy);

      if (this.windowsRelativePointer?.move(scaled.dx, scaled.dy)) {
        this.windowsVirtualPosition = null;
        return;
      }

      this.queueWindowsPointerMove(scaled.dx, scaled.dy);
      return;
    }
  }

  async leftClick(): Promise<void> {
    await this.flushPointerMove();
    await mouse.click(Button.LEFT);
  }

  async doubleClick(): Promise<void> {
    await this.flushPointerMove();
    await mouse.click(Button.LEFT);
    await mouse.click(Button.LEFT);
  }

  async rightClick(): Promise<void> {
    await this.flushPointerMove();
    await mouse.click(Button.RIGHT);
  }

  async scroll(dx: number, dy: number): Promise<void> {
    const PIXELS_PER_TICK = 2;
    const mapped = this.mapScrollDelta(dx, dy);

    if (
      mapped.dx !== 0 &&
      this.scrollAccumX !== 0 &&
      Math.sign(mapped.dx) !== Math.sign(this.scrollAccumX)
    ) {
      this.scrollAccumX = 0;
    }

    if (
      mapped.dy !== 0 &&
      this.scrollAccumY !== 0 &&
      Math.sign(mapped.dy) !== Math.sign(this.scrollAccumY)
    ) {
      this.scrollAccumY = 0;
    }

    this.scrollAccumX += mapped.dx;
    this.scrollAccumY += mapped.dy;

    const ticksY = Math.trunc(this.scrollAccumY / PIXELS_PER_TICK);
    const ticksX = Math.trunc(this.scrollAccumX / PIXELS_PER_TICK);

    if (ticksY !== 0) {
      this.scrollAccumY -= ticksY * PIXELS_PER_TICK;
      const amount = Math.abs(ticksY);
      if (ticksY > 0) {
        await mouse.scrollDown(amount);
      } else {
        await mouse.scrollUp(amount);
      }
    }

    if (ticksX !== 0) {
      this.scrollAccumX -= ticksX * PIXELS_PER_TICK;
      const amount = Math.abs(ticksX);
      if (ticksX > 0) {
        await mouse.scrollRight(amount);
      } else {
        await mouse.scrollLeft(amount);
      }
    }
  }

  private queueMacPointerMove(dx: number, dy: number): void {
    this.macPendingDx += dx * MAC_POINTER_GAIN;
    this.macPendingDy += dy * MAC_POINTER_GAIN;

    if (this.macPointerTimer !== null) {
      return;
    }

    this.macPointerTimer = setTimeout(() => {
      this.macPointerTimer = null;
      void this.flushMacPointerMove();
    }, MAC_POINTER_FRAME_MS);
  }

  private async flushPointerMove(): Promise<void> {
    if (this.platform === "darwin") {
      await this.flushMacPointerMove(true);
      return;
    }

    await this.flushWindowsPointerMove();
  }

  private async flushMacPointerMove(forceRemainder = false): Promise<void> {
    if (this.platform !== "darwin") {
      return;
    }

    if (this.macPointerTimer !== null) {
      clearTimeout(this.macPointerTimer);
      this.macPointerTimer = null;
    }

    const nextFlush = this.macPointerFlush.catch(() => undefined).then(async () => {
      const dx = this.macPendingDx;
      const dy = this.macPendingDy;

      this.macPendingDx = 0;
      this.macPendingDy = 0;

      const move = this.consumeMacPointerDelta(dx, dy, forceRemainder);

      if (move.dx === 0 && move.dy === 0) {
        return;
      }

      const now = Date.now();
      const current =
        this.macVirtualPosition &&
        now - this.macLastPointerFlushAt < MAC_POINTER_IDLE_RESET_MS
          ? this.macVirtualPosition
          : await mouse.getPosition();
      const { width, height } = await this.getScreenSize();
      const nextX = clamp(current.x + move.dx, 0, width - 1);
      const nextY = this.resolveVerticalEdgeY(
        clamp(current.y + move.dy, 0, height - 1),
        move.dy,
        height,
      );
      const next = new Point(nextX, nextY);

      this.resetMacRemainderAtEdge(current, next, width, height, move);
      this.macVirtualPosition = next;
      this.macLastPointerFlushAt = now;
      await mouse.setPosition(next);

      if (this.macPendingDx !== 0 || this.macPendingDy !== 0) {
        this.queueMacPointerMove(0, 0);
      }
    });

    this.macPointerFlush = nextFlush.catch(() => undefined);

    await nextFlush;
  }

  private consumeMacPointerDelta(
    dx: number,
    dy: number,
    forceRemainder: boolean,
  ): { dx: number; dy: number } {
    const nextX = this.macRemainderX + dx;
    const nextY = this.macRemainderY + dy;
    const moveX = forceRemainder ? Math.round(nextX) : Math.trunc(nextX);
    const moveY = forceRemainder ? Math.round(nextY) : Math.trunc(nextY);

    this.macRemainderX = nextX - moveX;
    this.macRemainderY = nextY - moveY;

    return {
      dx: moveX,
      dy: moveY,
    };
  }

  private resetMacRemainderAtEdge(
    current: Point,
    next: Point,
    width: number,
    height: number,
    move: { dx: number; dy: number },
  ): void {
    if (
      (next.x === 0 && move.dx < 0 && current.x === 0) ||
      (next.x === width - 1 && move.dx > 0 && current.x === width - 1)
    ) {
      this.macRemainderX = 0;
    }

    if (
      (next.y === 0 && move.dy < 0 && current.y === 0) ||
      (next.y === height - 1 && move.dy > 0 && current.y === height - 1)
    ) {
      this.macRemainderY = 0;
    }
  }

  private queueWindowsPointerMove(dx: number, dy: number): void {
    this.windowsPendingDx += dx;
    this.windowsPendingDy += dy;

    if (this.windowsPointerTimer !== null) {
      return;
    }

    this.windowsPointerTimer = setTimeout(() => {
      this.windowsPointerTimer = null;
      void this.flushWindowsPointerMove();
    }, WINDOWS_POINTER_FRAME_MS);
  }

  private async flushWindowsPointerMove(): Promise<void> {
    if (this.platform !== "win32") {
      return;
    }

    await this.windowsRelativePointer?.flush();
    await this.flushWindowsAbsolutePointerMove();
  }

  private async flushWindowsAbsolutePointerMove(): Promise<void> {
    if (this.windowsPointerTimer !== null) {
      clearTimeout(this.windowsPointerTimer);
      this.windowsPointerTimer = null;
    }

    const nextFlush = this.windowsPointerFlush.catch(() => undefined).then(async () => {
      const dx = this.windowsPendingDx;
      const dy = this.windowsPendingDy;

      this.windowsPendingDx = 0;
      this.windowsPendingDy = 0;

      if (dx === 0 && dy === 0) {
        return;
      }

      const now = Date.now();
      const current =
        this.windowsVirtualPosition &&
        now - this.windowsLastPointerFlushAt < WINDOWS_POINTER_IDLE_RESET_MS
          ? this.windowsVirtualPosition
          : await mouse.getPosition();
      const { width, height } = await this.getScreenSize();
      const next = new Point(
        clamp(Math.round(current.x + dx), 0, width - 1),
        clamp(Math.round(current.y + dy), 0, height - 1),
      );

      this.windowsVirtualPosition = next;
      this.windowsLastPointerFlushAt = now;
      await mouse.setPosition(next);

      if (this.windowsPendingDx !== 0 || this.windowsPendingDy !== 0) {
        this.queueWindowsPointerMove(0, 0);
      }
    });

    this.windowsPointerFlush = nextFlush.catch(() => undefined);

    await nextFlush;
  }

  private scaleWindowsPointerDelta(
    dx: number,
    dy: number,
  ): { dx: number; dy: number } {
    const distance = Math.hypot(dx, dy);

    if (distance <= WINDOWS_POINTER_ACCELERATION_START) {
      return { dx, dy };
    }

    const progress = clamp(
      (distance - WINDOWS_POINTER_ACCELERATION_START) /
        WINDOWS_POINTER_ACCELERATION_DISTANCE,
      0,
      1,
    );
    const boost =
      1 +
      (WINDOWS_POINTER_ACCELERATION_MAX - 1) *
        (1 - Math.pow(1 - progress, 2));

    return {
      dx: dx * boost,
      dy: dy * boost,
    };
  }

  private async getScreenSize(): Promise<{ width: number; height: number }> {
    const now = Date.now();

    if (
      this.screenSizeCache &&
      now - this.screenSizeCache.readAt < SCREEN_SIZE_CACHE_MS
    ) {
      return this.screenSizeCache;
    }

    const next = {
      width: await screen.width(),
      height: await screen.height(),
      readAt: now,
    };

    this.screenSizeCache = next;
    return next;
  }

  private mapScrollDelta(dx: number, dy: number): { dx: number; dy: number } {
    const mappedDx = this.platform === "darwin" ? -dx : dx;
    let nextDx = mappedDx;
    let nextDy = dy;
    const absX = Math.abs(nextDx);
    const absY = Math.abs(nextDy);

    if (absX > 0 && absY > 0) {
      if (absX < absY * SCROLL_AXIS_DEADZONE_RATIO) {
        nextDx = 0;
      }

      if (absY < absX * SCROLL_AXIS_DEADZONE_RATIO) {
        nextDy = 0;
      }
    }

    return {
      dx: nextDx,
      dy: nextDy,
    };
  }

  private resolveVerticalEdgeY(
    nextY: number,
    dy: number,
    screenHeight: number,
  ): number {
    if (this.platform !== "darwin") {
      return nextY;
    }

    if (this.verticalEdgeLock === "top") {
      if (dy > 0) {
        this.verticalEdgeReleaseDistance += dy;

        if (this.verticalEdgeReleaseDistance >= EDGE_RELEASE_DISTANCE) {
          this.verticalEdgeLock = null;
          this.verticalEdgeReleaseDistance = 0;
          return nextY;
        }
      } else {
        this.verticalEdgeReleaseDistance = 0;
      }

      return 0;
    }

    if (this.verticalEdgeLock === "bottom") {
      if (dy < 0) {
        this.verticalEdgeReleaseDistance += Math.abs(dy);

        if (this.verticalEdgeReleaseDistance >= EDGE_RELEASE_DISTANCE) {
          this.verticalEdgeLock = null;
          this.verticalEdgeReleaseDistance = 0;
          return nextY;
        }
      } else {
        this.verticalEdgeReleaseDistance = 0;
      }

      return screenHeight - 1;
    }

    if (nextY <= EDGE_PRESSURE_ZONE) {
      this.verticalEdgeLock = "top";
      this.verticalEdgeReleaseDistance = 0;
      return 0;
    }

    if (nextY >= screenHeight - 1 - EDGE_PRESSURE_ZONE) {
      this.verticalEdgeLock = "bottom";
      this.verticalEdgeReleaseDistance = 0;
      return screenHeight - 1;
    }

    return nextY;
  }
}

class WindowsRelativePointerInput {
  private child: ChildProcessWithoutNullStreams | null = null;
  private disabled = false;
  private remainderX = 0;
  private remainderY = 0;
  private flushSequence = 0;
  private stdoutBuffer = "";
  private lastMoveAt = 0;
  private readonly flushWaiters = new Map<string, () => void>();

  move(dx: number, dy: number): boolean {
    const command = this.consumeMove(dx, dy, this.resolveSmoothDurationMs());

    if (!command) {
      return true;
    }

    return this.write(command);
  }

  async flush(): Promise<void> {
    const remainderCommand = this.consumeMove(0, 0, 0, true);

    if (remainderCommand) {
      this.write(remainderCommand);
    }

    if (!this.child || this.disabled) {
      return;
    }

    const id = String(++this.flushSequence);

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        this.flushWaiters.delete(id);
        resolve();
      }, WINDOWS_POINTER_FLUSH_TIMEOUT_MS);

      this.flushWaiters.set(id, () => {
        clearTimeout(timeout);
        resolve();
      });

      if (!this.write(`f ${id}`)) {
        clearTimeout(timeout);
        this.flushWaiters.delete(id);
        resolve();
      }
    });
  }

  private consumeMove(
    dx: number,
    dy: number,
    durationMs: number,
    force = false,
  ): string | null {
    const nextX = this.remainderX + dx;
    const nextY = this.remainderY + dy;
    const moveX = force ? Math.round(nextX) : Math.trunc(nextX);
    const moveY = force ? Math.round(nextY) : Math.trunc(nextY);

    this.remainderX = nextX - moveX;
    this.remainderY = nextY - moveY;

    if (moveX === 0 && moveY === 0) {
      return null;
    }

    return `m ${moveX} ${moveY} ${durationMs}`;
  }

  private resolveSmoothDurationMs(): number {
    const now = Date.now();
    const elapsed = this.lastMoveAt > 0 ? now - this.lastMoveAt : 0;

    this.lastMoveAt = now;

    if (elapsed <= 0) {
      return WINDOWS_POINTER_DEFAULT_SMOOTH_MS;
    }

    return clamp(
      Math.round(elapsed),
      WINDOWS_POINTER_MIN_SMOOTH_MS,
      WINDOWS_POINTER_MAX_SMOOTH_MS,
    );
  }

  private write(command: string): boolean {
    const child = this.ensureChild();

    if (!child) {
      return false;
    }

    try {
      child.stdin.write(`${command}\n`);
      return true;
    } catch {
      this.disable();
      return false;
    }
  }

  private ensureChild(): ChildProcessWithoutNullStreams | null {
    if (this.disabled) {
      return null;
    }

    if (this.child) {
      return this.child;
    }

    try {
      const child = spawn(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          WINDOWS_RELATIVE_POINTER_SCRIPT,
        ],
        {
          windowsHide: true,
        },
      );

      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk) => this.handleStdout(chunk));
      child.once("error", () => this.disable());
      child.once("exit", () => this.disable());
      this.child = child;
      return child;
    } catch {
      this.disable();
      return null;
    }
  }

  private handleStdout(chunk: string): void {
    this.stdoutBuffer += chunk;

    while (true) {
      const lineEnd = this.stdoutBuffer.indexOf("\n");

      if (lineEnd < 0) {
        return;
      }

      const line = this.stdoutBuffer.slice(0, lineEnd).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(lineEnd + 1);

      if (!line.startsWith("ok ")) {
        continue;
      }

      const id = line.slice(3);
      const waiter = this.flushWaiters.get(id);

      if (waiter) {
        this.flushWaiters.delete(id);
        waiter();
      }
    }
  }

  private disable(): void {
    const child = this.child;

    this.disabled = true;
    this.child = null;

    if (child && !child.killed) {
      child.kill();
    }

    for (const waiter of this.flushWaiters.values()) {
      waiter();
    }

    this.flushWaiters.clear();
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

const WINDOWS_RELATIVE_POINTER_SCRIPT = `
$ErrorActionPreference = "Stop"
Add-Type -TypeDefinition @"
using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;

public static class RemoteControlMouseInput {
  private const int MaxSmoothSteps = 96;

  [StructLayout(LayoutKind.Sequential)]
  private struct INPUT {
    public UInt32 type;
    public MOUSEINPUT mi;
  }

  [StructLayout(LayoutKind.Sequential)]
  private struct MOUSEINPUT {
    public Int32 dx;
    public Int32 dy;
    public UInt32 mouseData;
    public UInt32 dwFlags;
    public UInt32 time;
    public IntPtr dwExtraInfo;
  }

  [DllImport("user32.dll", SetLastError = true)]
  private static extern UInt32 SendInput(UInt32 nInputs, INPUT[] pInputs, Int32 cbSize);

  public static void Move(Int32 dx, Int32 dy, Int32 durationMs) {
    if (dx == 0 && dy == 0) {
      return;
    }

    int steps = Math.Max(Math.Abs(dx), Math.Abs(dy));

    if (durationMs <= 0 || steps <= 1) {
      MoveOnce(dx, dy);
      return;
    }

    steps = Math.Min(steps, MaxSmoothSteps);

    long durationTicks = Stopwatch.Frequency * durationMs / 1000;
    Stopwatch stopwatch = Stopwatch.StartNew();
    int sentX = 0;
    int sentY = 0;

    for (int step = 1; step <= steps; step++) {
      int targetX = (int)Math.Round((double)dx * step / steps);
      int targetY = (int)Math.Round((double)dy * step / steps);
      int nextDx = targetX - sentX;
      int nextDy = targetY - sentY;

      if (nextDx != 0 || nextDy != 0) {
        MoveOnce(nextDx, nextDy);
        sentX = targetX;
        sentY = targetY;
      }

      if (step < steps) {
        WaitUntil(stopwatch, durationTicks * step / steps);
      }
    }
  }

  private static void MoveOnce(Int32 dx, Int32 dy) {
    if (dx == 0 && dy == 0) {
      return;
    }

    INPUT[] inputs = new INPUT[1];
    inputs[0].type = 0;
    inputs[0].mi.dx = dx;
    inputs[0].mi.dy = dy;
    inputs[0].mi.mouseData = 0;
    inputs[0].mi.dwFlags = 0x0001;
    inputs[0].mi.time = 0;
    inputs[0].mi.dwExtraInfo = IntPtr.Zero;

    UInt32 sent = SendInput(1, inputs, Marshal.SizeOf(typeof(INPUT)));
    if (sent != 1) {
      throw new Win32Exception(Marshal.GetLastWin32Error());
    }
  }

  private static void WaitUntil(Stopwatch stopwatch, long targetTicks) {
    while (stopwatch.ElapsedTicks < targetTicks) {
      long remainingTicks = targetTicks - stopwatch.ElapsedTicks;
      double remainingMs = remainingTicks * 1000.0 / Stopwatch.Frequency;

      if (remainingMs > 1.5) {
        Thread.Sleep(1);
      } else {
        Thread.SpinWait(80);
      }
    }
  }
}
"@

while (($line = [Console]::In.ReadLine()) -ne $null) {
  if ($line.Length -eq 0) {
    continue
  }

  $parts = $line.Split(" ")

  try {
    if ($parts[0] -eq "m" -and $parts.Length -ge 4) {
      [RemoteControlMouseInput]::Move([int]$parts[1], [int]$parts[2], [int]$parts[3])
      continue
    }

    if ($parts[0] -eq "f" -and $parts.Length -ge 2) {
      [Console]::Out.WriteLine("ok " + $parts[1])
      [Console]::Out.Flush()
      continue
    }

    if ($parts[0] -eq "q") {
      break
    }
  } catch {
    [Console]::Error.WriteLine($_.Exception.Message)
  }
}
`;
