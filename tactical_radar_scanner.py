import math
import os
import random
import time
from typing import List, Tuple

GRID_SIZE: int = 15
CENTER: int = GRID_SIZE // 2
SWEEP_SPEED: float = 0.25
DECAY_RATE: float = 0.08
BLIP_COUNT: int = 4

# Tactical ASCII intensity palette
PALETTE: str = " .:-=+*#%@"


class Blip:
    def __init__(self, x: int, y: int) -> None:
        self.x: int = x
        self.y: int = y
        self.intensity: float = 0.0

    @property
    def angle(self) -> float:
        dx = self.x - CENTER
        dy = -(self.y - CENTER)
        return (math.atan2(dy, dx) + 2 * math.pi) % (2 * math.pi)

    def trigger(self) -> None:
        self.intensity = 1.0

    def decay(self) -> None:
        self.intensity = max(0.0, self.intensity - DECAY_RATE)


def clear_screen() -> None:
    os.system("cls" if os.name == "nt" else "clear")


def generate_blips(count: int) -> List[Blip]:
    blips: List[Blip] = []
    while len(blips) < count:
        x = random.randint(1, GRID_SIZE - 2)
        y = random.randint(1, GRID_SIZE - 2)
        dist = math.hypot(x - CENTER, y - CENTER)
        if 2.0 <= dist <= (CENTER - 0.5):
            blips.append(Blip(x, y))
    return blips


def render_radar(angle: float, blips: List[Blip]) -> str:
    frame: List[str] = []
    frame.append("=== [ TACTICAL RADAR HUD ] ===")

    for y in range(GRID_SIZE):
        row: List[str] = []
        for x in range(GRID_SIZE):
            dx = x - CENTER
            dy = -(y - CENTER)
            dist = math.hypot(dx, dy)
            cell_angle = (math.atan2(dy, dx) + 2 * math.pi) % (2 * math.pi)

            # Center beacon
            if x == CENTER and y == CENTER:
                row.append("X")
                continue

            # Outer boundary ring & inner distance range rings
            if abs(dist - CENTER) < 0.6 or abs(dist - (CENTER / 2)) < 0.5:
                row.append("·")
                continue

            # Check if cell matches an active blip
            matched_blip = next((b for b in blips if b.x == x and b.y == y and b.intensity > 0.1), None)
            if matched_blip:
                idx = int(matched_blip.intensity * (len(PALETTE) - 1))
                row.append(PALETTE[idx])
                continue

            # Radar sweep line rendering
            angle_diff = abs(cell_angle - angle)
            angle_diff = min(angle_diff, 2 * math.pi - angle_diff)
            if angle_diff < 0.18 and dist <= CENTER:
                row.append("/")
            else:
                row.append(" ")

        frame.append(" ".join(row))

    frame.append(f"AZIMUTH: {math.degrees(angle):05.1f}° | TARGETS: {len(blips)}")
    return "\n".join(frame)


def run_scanner() -> None:
    current_angle: float = 0.0
    targets: List[Blip] = generate_blips(BLIP_COUNT)

    try:
        while True:
            # Check target hits along beam
            for blip in targets:
                diff = abs(blip.angle - current_angle)
                diff = min(diff, 2 * math.pi - diff)
                if diff < SWEEP_SPEED:
                    blip.trigger()
                blip.decay()

            clear_screen()
            print(render_radar(current_angle, targets))

            current_angle = (current_angle + SWEEP_SPEED) % (2 * math.pi)
            time.sleep(0.08)
    except KeyboardInterrupt:
        print("\nRadar offline.")


if __name__ == "__main__":
    run_scanner()
