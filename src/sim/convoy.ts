export interface Follower {
  x: number;
  y: number;
  heading: number;
}

/** Ignore lead movement smaller than this when recording the path, in px. */
const MIN_STEP = 1.5;
/** Path kept beyond the last follower, in px. */
const SLACK = 60;

/** Clear road kept between one vehicle's tail and the next one's nose, in px. */
export const CONVOY_GAP = 4;

/**
 * How far behind the lead each follower's middle rides: `leadTail` is how far the lead reaches
 * back, `lengths` the followers' lengths in order.
 */
export function convoyDistances(leadTail: number, lengths: readonly number[]): number[] {
  let tail = leadTail;
  return lengths.map((length) => {
    const middle = tail + CONVOY_GAP + length / 2;
    tail = middle + length / 2;
    return middle;
  });
}

/**
 * Remembers the lead's path so escorts can drive along it in a column. The lead's path is
 * always passable, so followers never need their own collision checks.
 */
export class Convoy {
  /** Newest point first. */
  private pts: { x: number; y: number }[] = [];

  get length(): number {
    return this.pts.length;
  }

  reset(x: number, y: number): void {
    this.pts = [{ x, y }];
  }

  record(x: number, y: number): void {
    const head = this.pts[0];
    if (head && Math.hypot(x - head.x, y - head.y) < MIN_STEP) return;
    this.pts.unshift({ x, y });
  }

  /** Positions at these distances back along the path; the distances must increase. */
  followers(distances: readonly number[]): Follower[] {
    const out: Follower[] = [];
    if (this.pts.length === 0) return out;
    let walked = 0;
    let seg = 0;
    for (let i = 1; i <= distances.length; i++) {
      const want = distances[i - 1];
      while (seg < this.pts.length - 1) {
        const a = this.pts[seg];
        const b = this.pts[seg + 1];
        const len = Math.hypot(a.x - b.x, a.y - b.y);
        if (walked + len >= want) {
          const f = (want - walked) / len;
          out.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, heading: Math.atan2(a.y - b.y, a.x - b.x) });
          break;
        }
        walked += len;
        seg++;
      }
      if (out.length < i) {
        // not enough path yet: wait at its oldest point
        const last = this.pts[this.pts.length - 1];
        const prev = this.pts[Math.max(0, this.pts.length - 2)];
        const heading = prev === last ? 0 : Math.atan2(prev.y - last.y, prev.x - last.x);
        out.push({ x: last.x, y: last.y, heading });
      }
    }
    this.trim((distances[distances.length - 1] ?? 0) + SLACK);
    return out;
  }

  private trim(keep: number): void {
    let walked = 0;
    for (let i = 1; i < this.pts.length; i++) {
      walked += Math.hypot(this.pts[i].x - this.pts[i - 1].x, this.pts[i].y - this.pts[i - 1].y);
      if (walked > keep) {
        this.pts.length = i + 1;
        return;
      }
    }
  }
}
