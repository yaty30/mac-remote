import { Button, Point, mouse, screen } from "@nut-tree-fork/nut-js";
import type { HostPlatform } from "../types/protocol";

const EDGE_PRESSURE_ZONE = 6;
const EDGE_RELEASE_DISTANCE = 24;

type VerticalEdgeLock = "top" | "bottom" | null;

export class MouseController {
  private scrollAccumX = 0;
  private scrollAccumY = 0;
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
    await mouse.click(Button.LEFT);
  }

  async doubleClick(): Promise<void> {
    await mouse.click(Button.LEFT);
    await mouse.click(Button.LEFT);
  }

  async rightClick(): Promise<void> {
    await mouse.click(Button.RIGHT);
  }

  async scroll(dx: number, dy: number): Promise<void> {
    const PIXELS_PER_TICK = 2;

    this.scrollAccumX += dx;
    this.scrollAccumY += dy;

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
