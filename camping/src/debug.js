// window.debugAPI — deterministic camera views + state control for the
// screenshot harness (tools/shots.mjs). Also handy in the browser console.
import * as THREE from 'three';
import { getTerrainHeight, POND, WATER_LEVEL } from './terrain.js';

export function installDebugAPI({ player, timeOfDay, camp, interactions, renderer, hud, scene, camera }) {
  const h = (x, z) => getTerrainHeight(x, z);

  // named views: [posX, posY, posZ, targetX, targetY, targetZ]
  function views() {
    const fire = camp.positions.fire;
    const pile = camp.positions.pile;
    const seat = camp.positions.seat;
    const tent = camp.positions.tent;
    return {
      camp: {
        pos: [5.6, h(5.6, 4.8) + 1.7, 4.8],
        target: [tent.x, fire.y + 1.1, tent.z],
      },
      vista: {
        pos: [-50, h(-50, 6) + 5.5, 6],
        target: [170, 75, -10],
      },
      forest: {
        pos: [-14, h(-14, -16) + 1.7, -16],
        target: [-55, h(-55, -48) + 6, -48],
      },
      pond: {
        pos: [POND.x - 14.5, WATER_LEVEL + 2.3, POND.z + 9],
        target: [POND.x + 10, WATER_LEVEL + 1.2, POND.z - 6],
      },
      aim_fire: { pos: [fire.x + 2.2, fire.y + 1.7, fire.z + 0.6], target: [fire.x, fire.y + 0.35, fire.z] },
      aim_wood: { pos: [pile.x + 2.0, pile.y + 1.7, pile.z - 0.8], target: [pile.x, pile.y + 0.35, pile.z] },
      aim_log: { pos: [seat.x + 1.9, seat.y + 1.5, seat.z + 1.3], target: [seat.x, seat.y, seat.z] },
      aim_tent: { pos: [tent.x + 2.6, tent.y + 1.8, tent.z + 2.0], target: [tent.x, tent.y + 0.9, tent.z] },
    };
  }

  let fps = 0;
  let lastT = performance.now();
  function tickFPS() {
    const now = performance.now();
    const dt = now - lastT;
    lastT = now;
    if (dt > 0) fps = fps * 0.95 + (1000 / dt) * 0.05;
  }

  const api = {
    setView(name) {
      const v = views()[name];
      if (!v) return false;
      const pos = new THREE.Vector3(...v.pos);
      const tgt = new THREE.Vector3(...v.target);
      const dir = tgt.clone().sub(pos);
      const yaw = Math.atan2(-dir.x, -dir.z);
      const pitch = Math.atan2(dir.y, Math.hypot(dir.x, dir.z));
      if (name.startsWith('aim_')) {
        player.controlMode = 'player';
        player.enabled = true;
        player.setPose(pos, yaw, pitch);
      } else {
        player.controlMode = 'debug';
        camera.position.copy(pos);
        camera.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
      }
      return true;
    },
    setState({ timeOfDay: todName, fireLit } = {}) {
      if (todName) timeOfDay.set(todName, true);
      if (fireLit !== undefined) camp.fire.setLit(!!fireLit);
      return api.getState();
    },
    getState() {
      return {
        timeOfDay: timeOfDay.current,
        fireLit: camp.fire.lit,
        fireBoost: camp.fire.boost,
        seated: interactions.seated,
        busy: interactions.busy,
      };
    },
    interact() {
      interactions.trigger();
      return interactions.hovered ? interactions.hovered.key : null;
    },
    getHovered() {
      return interactions.hovered ? interactions.hovered.key : null;
    },
    getStats() {
      return {
        fps: Math.round(fps * 10) / 10,
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        frame: window.__FRAME,
      };
    },
    getPlayerState() {
      return player.getState();
    },
    setMoveInput({ f = false, b = false, l = false, r = false } = {}) {
      player.controlMode = 'player';
      player.debugMove = { f, b, l, r };
    },
    setHUD(visible) {
      hud.setVisible(visible);
    },
    listViews() {
      return Object.keys(views());
    },
    _tickFPS: tickFPS,
  };

  window.debugAPI = api;
  return api;
}
