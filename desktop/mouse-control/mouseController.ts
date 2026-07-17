import { Button, Point, mouse, screen } from "@nut-tree-fork/nut-js";
import type { HostPlatform } from "../types/protocol";

const EDGE_PRESSURE_ZONE = 6;
const EDGE_RELEASE_DISTANCE = 24;
const WINDOWS_POINTER_FRAME_MS = 8;
const WINDOWS_POINTER_IDLE_RESET_MS = 250;
const SCREEN_SIZE_CACHE_MS = 1000;
const SCROLL_AXIS_DEADZONE_RATIO = 0.35;

type VerticalEdgeLock = "top" | "bottom" | null;

export class MouseController {
  private scrollAccumX = 0;
  private scrollAccumY = 0;
  private windowsPendingDx = 0;
  private windowsPendingDy = 0;
  private windowsPointerTimer: ReturnType<typeof setTimeout> | null = null;
  private windowsPointerFlush: Promise<void> = Promise.resolve();
  private windowsVirtualPosition: Point | null = null;
  private windowsLastPointerFlushAt = 0;
  private screenSizeCache:
    | { width: number; height: number; readAt: number }
    | null = null;
  private verticalEdgeLock: VerticalEdgeLock = null;
  private verticalEdgeReleaseDistance = 0;

  constructor(
    private readonly sensitivity: number,
    private readonly platform: HostPlatform,
  ) {
    mouse.config.autoDelayMs = 0;
    mouse.config.mouseSpeed = 32000;
  }

  async moveRelative(dx: number, dy: number): Promise<void> {
    if (this.platform === "win32") {
      this.queueWindowsPointerMove(dx * this.sensitivity, dy * this.sensitivity);
      return;
    }

    const current = await mouse.getPosition();
    const width = await screen.width();
    const height = await screen.height();
    const scaledDx = dx * this.sensitivity;
    const scaledDy = dy * this.sensitivity;
    const nextX = clamp(Math.round(current.x + scaledDx), 0, width - 1);
    const nextY = this.resolveVerticalEdgeY(
      clamp(Math.round(current.y + scaledDy), 0, height - 1),
      scaledDy,
      height,
    );

    await mouse.move(
      buildMovementPath(current, new Point(nextX, nextY), this.platform),
    );
  }

  async leftClick(): Promise<void> {
    await this.flushWindowsPointerMove();
    await mouse.click(Button.LEFT);
  }

  async doubleClick(): Promise<void> {
    await this.flushWindowsPointerMove();
    await mouse.click(Button.LEFT);
    await mouse.click(Button.LEFT);
  }

  async rightClick(): Promise<void> {
    await this.flushWindowsPointerMove();
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

function buildMovementPath(
  from: Point,
  to: Point,
  platform: HostPlatform,
): Point[] {
  if (platform === "win32") {
    return [to];
  }

  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = clamp(Math.ceil(distance / 12), 1, 10);
  const path: Point[] = [];

  for (let step = 1; step <= steps; step += 1) {
    const progress = step / steps;
    path.push(
      new Point(
        Math.round(from.x + (to.x - from.x) * progress),
        Math.round(from.y + (to.y - from.y) * progress),
      ),
    );
  }

  return path;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
