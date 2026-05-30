import { Button, Point, mouse, screen } from "@nut-tree-fork/nut-js";

const EDGE_PRESSURE_ZONE = 6;
const EDGE_NUDGE_DISTANCE = 18;

export class MouseController {
  private scrollAccumX = 0;
  private scrollAccumY = 0;

  constructor(private readonly sensitivity: number) {
    mouse.config.autoDelayMs = 0;
    mouse.config.mouseSpeed = 32000;
  }

  async moveRelative(dx: number, dy: number): Promise<void> {
    const current = await mouse.getPosition();
    const width = await screen.width();
    const height = await screen.height();
    const nextX = clamp(Math.round(current.x + dx * this.sensitivity), 0, width - 1);
    const nextY = clamp(Math.round(current.y + dy * this.sensitivity), 0, height - 1);

    await mouse.move(buildMovementPath(current, new Point(nextX, nextY)));
    await this.applyMacEdgePressure(nextX, nextY, height);
  }

  async leftClick(): Promise<void> {
    await mouse.click(Button.LEFT);
  }

  async rightClick(): Promise<void> {
    await mouse.click(Button.RIGHT);
  }

  async scroll(dx: number, dy: number): Promise<void> {
    const PIXELS_PER_TICK = 2.5;

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

  private async applyMacEdgePressure(x: number, y: number, screenHeight: number): Promise<void> {
    if (process.platform !== "darwin") {
      return;
    }

    if (y <= EDGE_PRESSURE_ZONE) {
      await mouse.move([new Point(x, EDGE_NUDGE_DISTANCE), new Point(x, 0)]);
      return;
    }

    if (y >= screenHeight - 1 - EDGE_PRESSURE_ZONE) {
      await mouse.move([
        new Point(x, screenHeight - 1 - EDGE_NUDGE_DISTANCE),
        new Point(x, screenHeight - 1),
      ]);
    }
  }
}

function buildMovementPath(from: Point, to: Point): Point[] {
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
