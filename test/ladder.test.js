import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEG, IDEAL_ANGLE, baseAdjustment, classifyAngle, fallDetector, railAngle, sideLean, smoother, wobble } from '../src/ladder.js';

const G = 9.81;
// gravity vector seen by a phone whose y axis is tilted `deg` above horizontal, twisted `twist` about y
const grav = (deg, twist = 0) => {
  const a = deg / DEG;
  const t = twist / DEG;
  const along = G * Math.sin(a);
  const across = G * Math.cos(a);
  return { x: across * Math.sin(t), y: -along, z: -across * Math.cos(t) };
};

test('4-to-1 rule is about 76 degrees', () => {
  assert.ok(Math.abs(IDEAL_ANGLE - 75.96) < 0.01);
});

test('rail angle is recovered whatever the twist or screen direction', () => {
  for (const deg of [10, 45, 60, 75.5, 85]) {
    for (const twist of [0, 30, 90, 180, -60]) {
      assert.ok(Math.abs(railAngle(grav(deg, twist)) - deg) < 1e-6, `${deg}/${twist}`);
      const flipped = grav(deg, twist);
      flipped.y = -flipped.y; // phone upside down along the rail
      assert.ok(Math.abs(railAngle(flipped) - deg) < 1e-6);
    }
  }
  assert.ok(Number.isNaN(railAngle({ x: 0, y: 0, z: 0 })));
});

test('angle classification bands', () => {
  assert.equal(classifyAngle(5), 'invalid');
  assert.equal(classifyAngle(60), 'too-shallow');
  assert.equal(classifyAngle(70), 'shallow');
  assert.equal(classifyAngle(75.5), 'safe');
  assert.equal(classifyAngle(IDEAL_ANGLE), 'safe');
  assert.equal(classifyAngle(80), 'steep');
  assert.equal(classifyAngle(88), 'too-steep');
});

test('base adjustment matches the 4-to-1 rule', () => {
  const a = baseAdjustment(4, IDEAL_ANGLE);
  assert.ok(Math.abs(a.move) < 1e-9);
  const shallow = baseAdjustment(4, 65);
  assert.ok(shallow.move < 0, 'too shallow → move feet in');
  const steep = baseAdjustment(4, 85);
  assert.ok(steep.move > 0, 'too steep → move feet out');
  // 4 m ladder: ideal base ≈ 0.97 m
  assert.ok(Math.abs(a.ideal - 0.970) < 0.01);
  assert.equal(baseAdjustment(0, 70), null);
});

test('side lean', () => {
  assert.ok(Math.abs(sideLean({ x: G * Math.sin(5 / DEG), y: 0, z: -G * Math.cos(5 / DEG) }) - 5) < 1e-6);
});

test('smoother converges', () => {
  const s = smoother(0.5);
  let v;
  for (let i = 0; i < 30; i++) v = s({ x: 1, y: 2, z: 3 });
  assert.ok(Math.abs(v.y - 2) < 1e-6);
});

test('wobble levels', () => {
  const still = Array.from({ length: 100 }, (_, i) => ({ x: 0, y: 0, z: G + 0.02 * Math.sin(i) }));
  const shaky = Array.from({ length: 100 }, (_, i) => ({ x: 1.5 * Math.sin(i), y: 0, z: G + 1.6 * Math.sin(i * 1.3) }));
  assert.equal(wobble(still).level, 'steady');
  assert.equal(wobble(shaky).level, 'unstable');
  assert.equal(wobble([]).level, 'unknown');
});

test('fall detector: free fall then impact triggers once; normal climbing does not', () => {
  const det = fallDetector();
  const out = [];
  let t = 0;
  const feed = (g, ms) => {
    for (let i = 0; i < ms / 10; i++) out.push(det({ x: 0, y: 0, z: g * G, t: (t += 10) }));
  };
  feed(1, 500); // standing
  feed(1.4, 200); // climbing steps
  feed(0.6, 100); // bounce
  feed(1, 300);
  assert.equal(out.filter(Boolean).length, 0, 'no false alarm while climbing');
  feed(0.1, 250); // falling
  feed(3.2, 30); // impact
  feed(1, 300);
  assert.equal(out.filter(Boolean).length, 1);
});

test('fall detector ignores a drop with no impact, and a bump with no drop', () => {
  const det = fallDetector();
  let t = 0;
  const hits = [];
  for (let i = 0; i < 20; i++) hits.push(det({ x: 0, y: 0, z: 0.1 * G, t: (t += 10) }));
  for (let i = 0; i < 200; i++) hits.push(det({ x: 0, y: 0, z: G, t: (t += 10) }));
  for (let i = 0; i < 5; i++) hits.push(det({ x: 0, y: 0, z: 3 * G, t: (t += 10) }));
  assert.equal(hits.filter(Boolean).length, 0);
});
