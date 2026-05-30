import { app } from "../../../scripts/app.js";

const CLICK_RADIUS_SQ = 100;
const SYNTHETIC = Symbol('pensupport');

let enabled = true;
let debugEnabled = false;

const DEBUG_MAX = 12;
let debugLines = [];
let debugEl = null;

function debugLog(msg) {
  if (!debugEnabled) return;
  if (!debugEl) {
    debugEl = document.createElement('div');
    debugEl.id = 'pensupport-debug';
    debugEl.style.cssText =
      'position:fixed;bottom:8px;right:8px;' +
      'background:rgba(0,0,0,0.85);color:#4f4;' +
      'font:11px/1.6 monospace;padding:8px 12px;' +
      'border-radius:6px;z-index:999999;' +
      'pointer-events:none;min-width:260px;' +
      'white-space:pre;border:1px solid #4f4;';
    document.body.appendChild(debugEl);
  }
  debugLines.push(msg);
  if (debugLines.length > DEBUG_MAX) debugLines.shift();
  debugEl.textContent = '[PenSupport]\n' + debugLines.join('\n');
}

function removeDebugOverlay() {
  debugLines = [];
  if (debugEl) { debugEl.remove(); debugEl = null; }
}

const CURSOR_HIDE_MS = 600;

// Pen-tip cursor icon set. Every icon is 24×24, centred at (12, 12) — hotspots
// are uniform and rotation is trivial.
//
// Visual grammar:
//   * Pen UP   = ring (open circle). Ring size encodes mode.
//   * Pen DOWN = dot. The commit indicator — pen has touched.
//   * Hovering an interactable adds an inner dot to the ring so you can tell
//     at a glance that "something will happen if I press here."
//   * grab uses a larger ring (size signals grippability).
//   * grabbing fills the ring with translucent white — distinct from a plain
//     press, and overrides the pen-down dot since drag state is the headline.
//   * Mode-specific decorations (crosshair ticks, resize arrows, etc.) layer
//     around the ring + dot without obscuring the pen tip.
const SVG = (body) => `<svg viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
// White ring with thin dark outlines on both sides — readable on any background.
// Implemented as a fat dark stroke with a narrower white stroke painted over it.
const RING = (r) =>
  `<circle cx="12" cy="12" r="${r}" fill="none" stroke="black" stroke-width="2.8" opacity="0.45"/>` +
  `<circle cx="12" cy="12" r="${r}" fill="none" stroke="white" stroke-width="1.6"/>`;
// Small inner dot — appears when hovering over something interactable.
const DOT = '<circle cx="12" cy="12" r="1.8" fill="white" stroke="black" stroke-width="0.7"/>';
// Press dot — shown while the pen is pressed (commit indicator).
const PRESS_DOT = '<circle cx="12" cy="12" r="3.2" fill="white" stroke="black" stroke-width="1.2"/>';
// Single white line with thin dark border on both sides — matches RING.
// Implemented as a fat dark stroke with a narrower white stroke painted over it.
const STROKED = (d, w = 2.8) =>
  `<path d="${d}" stroke="black" stroke-width="${w}" stroke-opacity="0.45" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` +
  `<path d="${d}" stroke="white" stroke-width="${(w - 1.2).toFixed(2)}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;

const DEFAULT_SVG  = SVG(RING(7));
const PRESSED_SVG  = SVG(PRESS_DOT);
const POINTER_SVG  = SVG(RING(7) + DOT);
const GRAB_SVG     = SVG(RING(10) + DOT);
// Same ring as grab, but with a translucent white fill — the disc reads as
// "captured / locked in" without going dark. Press-dot stays visible thanks
// to its black outline.
const GRABBING_SVG = SVG(
  '<circle cx="12" cy="12" r="10" fill="rgba(255,255,255,0.5)"/>' +
  RING(10) + PRESS_DOT);
const CROSS_SVG    = SVG(STROKED('M12 1 V23 M1 12 H23', 3) + RING(7) + DOT);
const MOVE_SVG     = SVG(RING(7) + STROKED('M12 2 V5 M9 5 L12 2 L15 5 M12 22 V19 M9 19 L12 22 L15 19 M2 12 H5 M5 9 L2 12 L5 15 M22 12 H19 M19 9 L22 12 L19 15') + DOT);
const TEXT_SVG     = SVG(RING(7) + STROKED('M9 2 H15 M9 22 H15 M12 2 V5 M12 19 V22', 3) + DOT);
const RESIZE_EW_SVG = SVG(RING(7) + STROKED('M2 12 H5 M5 9 L2 12 L5 15 M22 12 H19 M19 9 L22 12 L19 15') + DOT);
const NOT_ALLOWED_SVG = SVG(
  '<circle cx="12" cy="12" r="8" fill="none" stroke="white" stroke-width="2.8"/>' +
  '<line x1="6.5" y1="6.5" x2="17.5" y2="17.5" stroke="white" stroke-width="3" stroke-linecap="round"/>' +
  '<circle cx="12" cy="12" r="8" fill="none" stroke="#dc2626" stroke-width="1.5"/>' +
  '<line x1="6.5" y1="6.5" x2="17.5" y2="17.5" stroke="#dc2626" stroke-width="1.5" stroke-linecap="round"/>' + DOT);

const H = { hx: 12, hy: 12 };
const CURSOR_ICONS = {
  default:         { svg: DEFAULT_SVG,     ...H },
  _pressed:        { svg: PRESSED_SVG,     ...H }, // synthetic — used while pen is down
  pointer:         { svg: POINTER_SVG,     ...H },
  grab:            { svg: GRAB_SVG,        ...H },
  grabbing:        { svg: GRABBING_SVG,    ...H },
  crosshair:       { svg: CROSS_SVG,       ...H },
  cell:            { svg: CROSS_SVG,       ...H },
  move:            { svg: MOVE_SVG,        ...H },
  'all-scroll':    { svg: MOVE_SVG,        ...H },
  text:            { svg: TEXT_SVG,        ...H },
  'vertical-text': { svg: TEXT_SVG,        ...H, rot: 90 },
  'ew-resize':     { svg: RESIZE_EW_SVG,   ...H },
  'col-resize':    { svg: RESIZE_EW_SVG,   ...H },
  'ns-resize':     { svg: RESIZE_EW_SVG,   ...H, rot: 90 },
  'row-resize':    { svg: RESIZE_EW_SVG,   ...H, rot: 90 },
  'nesw-resize':   { svg: RESIZE_EW_SVG,   ...H, rot: -45 },
  'nwse-resize':   { svg: RESIZE_EW_SVG,   ...H, rot: 45  },
  'not-allowed':   { svg: NOT_ALLOWED_SVG, ...H },
  'no-drop':       { svg: NOT_ALLOWED_SVG, ...H },
  none:            { svg: '',              hx: 0, hy: 0 },
};

let cursorEl = null;
let cursorTimer = null;
let cursorIconName = null;

function getCursor() {
  if (cursorEl) return cursorEl;
  cursorEl = document.createElement('div');
  cursorEl.id = 'pensupport-cursor';
  cursorEl.style.cssText =
    'position:fixed;pointer-events:none;z-index:999998;' +
    // Animate opacity only — animating position introduces visible lag.
    'transition:opacity 150ms ease;opacity:0;' +
    // Rotation pivots at centre; rotated icons (resize variants) have their
    // hotspot at the SVG centre so the pen tip stays put under rotation.
    'transform-origin:center;line-height:0;';
  document.body.appendChild(cursorEl);
  return cursorEl;
}

// CSS cursor can be "grab", "url('x') 4 4, pointer", "auto", etc.
// Walk the comma list right-to-left, skip url(...) and the meta keywords,
// return the first concrete keyword. Fall back to "default".
function parseCursor(value) {
  if (!value) return 'default';
  const parts = value.split(',').map(s => s.trim());
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    if (!p || p.startsWith('url(') || p === 'auto' || p === 'inherit' || p === 'unset' || p === 'initial') continue;
    return p;
  }
  return 'default';
}

function applyCursorIcon(name) {
  const icon = CURSOR_ICONS[name] ?? CURSOR_ICONS.default;
  if (cursorIconName !== name) {
    cursorIconName = name;
    cursorEl.innerHTML = icon.svg;
    cursorEl.style.transform = icon.rot ? `rotate(${icon.rot}deg)` : 'none';
    cursorEl.style.display = icon.svg ? '' : 'none';
  }
  return icon;
}

function moveCursor(x, y, cursorName, pressed) {
  const el = getCursor();
  // Pen down → swap to the press-dot. Grabbing keeps its own indicator
  // because drag state matters more than the press indicator.
  const useName = pressed && cursorName !== 'grabbing'
    ? '_pressed'
    : (cursorName || 'default');
  const icon = applyCursorIcon(useName);
  el.style.left = (x - icon.hx) + 'px';
  el.style.top  = (y - icon.hy) + 'px';
  el.style.opacity = '1';
  clearTimeout(cursorTimer);
  cursorTimer = setTimeout(() => { if (cursorEl) cursorEl.style.opacity = '0'; }, CURSOR_HIDE_MS);
}

// Read whatever CSS cursor would apply at (x, y). Must be called AFTER the
// synthetic mouse event is dispatched, since hit-tested handlers (e.g. the
// LiteGraph canvas) update their own .style.cursor in response.
function readCursorAt(x, y) {
  const el = document.elementFromPoint(x, y);
  if (!el) return 'default';
  return parseCursor(getComputedStyle(el).cursor);
}

function destroyCursor() {
  clearTimeout(cursorTimer);
  if (cursorEl) { cursorEl.remove(); cursorEl = null; }
  cursorIconName = null;
}

const MOUSE_TO_PTR = { mousedown: 'pointerdown', mousemove: 'pointermove', mouseup: 'pointerup' };

function setupPenSupport() {
  let penDown = false;
  let penDownX = 0;
  let penDownY = 0;
  // Element that received the pointerdown — all subsequent move/up events go to the same
  // target to simulate pointer capture and prevent drag-off-edge leaving elements stuck.
  let penTarget = null;

  function getCanvasEl() {
    return app.canvas?.canvas ?? document.querySelector('canvas');
  }

  // elementFromPoint on iPad can return an overlay div that is a sibling of the canvas,
  // not an ancestor — events dispatched there never reach LiteGraph's canvas listener.
  // Real UI panels (dropdowns, sidebar) live in separate DOM subtrees outside the canvas
  // container, so we only force canvas for elements inside that container.
  // forcedTarget bypasses elementFromPoint entirely (used to pin move/up to the down target).
  function dispatch(mouseType, src, buttons, forcedTarget = null) {
    const canvasEl = getCanvasEl();
    let target = forcedTarget ?? document.elementFromPoint(src.clientX, src.clientY) ?? src.target;
    if (!forcedTarget && canvasEl) {
      const r = canvasEl.getBoundingClientRect();
      const inCanvas = src.clientX >= r.left && src.clientX <= r.right &&
                       src.clientY >= r.top  && src.clientY <= r.bottom;
      if (inCanvas) {
        const p = canvasEl.parentElement;
        const inContainer = p && p !== document.body && p.contains(target) && target !== canvasEl;
        if (inContainer) {
          // Element is inside the canvas container (could be overlay or sidebar).
          // Override to canvas only when it's not an interactive element.
          // .lg-node / [data-node-id] = ComfyUI Nodes 2.0 Vue-rendered node root;
          // its @pointerdown="nodeOnPointerdown" is what handles header-bar drag.
          if (!target.closest('button,a,input,select,textarea,[role="button"],[role="option"],[role="menuitem"],[data-testid*="minimap"],[class*="minimap"],.lg-node,[data-node-id]'))
            target = canvasEl;
        }
        // Elements outside the canvas container (e.g. LiteGraph combo popups appended to
        // document.body) are left as-is — no override needed.
      }
    }

    const base = {
      bubbles: true, cancelable: true, view: window,
      clientX: src.clientX, clientY: src.clientY,
      screenX: src.screenX, screenY: src.screenY,
      ctrlKey: src.ctrlKey ?? false, altKey: src.altKey ?? false,
      shiftKey: src.shiftKey ?? false, metaKey: src.metaKey ?? false,
      button: 0, buttons,
    };

    const me = new MouseEvent(mouseType, base);
    me[SYNTHETIC] = true;
    target.dispatchEvent(me);

    const ptrType = MOUSE_TO_PTR[mouseType];
    if (ptrType) {
      const pe = new PointerEvent(ptrType, {
        ...base,
        pointerType: 'mouse', pointerId: 1, isPrimary: true,
        pressure: buttons > 0 ? 0.5 : 0, width: 1, height: 1,
      });
      pe[SYNTHETIC] = true;
      target.dispatchEvent(pe);
    }

    return target;
  }

  function dispatchClick(target, src) {
    const ce = new MouseEvent('click', {
      bubbles: true, cancelable: true, view: window,
      clientX: src.clientX, clientY: src.clientY,
      screenX: src.screenX, screenY: src.screenY,
      ctrlKey: src.ctrlKey ?? false, altKey: src.altKey ?? false,
      shiftKey: src.shiftKey ?? false, metaKey: src.metaKey ?? false,
      button: 0, buttons: 0,
    });
    ce[SYNTHETIC] = true;
    target.dispatchEvent(ce);
  }

  function isTap(x, y) {
    const dx = x - penDownX;
    const dy = y - penDownY;
    return dx * dx + dy * dy <= CLICK_RADIUS_SQ;
  }

  window.addEventListener("pointerdown", (e) => {
    if (e[SYNTHETIC]) return;
    debugLog(`PTR-dn  ${e.pointerType.padEnd(6)} (${Math.round(e.clientX)},${Math.round(e.clientY)}) p=${e.pressure.toFixed(2)} btn=${e.buttons}`);
    if (!enabled || e.pointerType !== "pen") return;
    e.preventDefault();
    e.stopImmediatePropagation();
    penDown = true;
    penDownX = e.clientX;
    penDownY = e.clientY;
    // ComfyUI sets leftMouseClickBehavior='panning' on touch devices. Clear it temporarily
    // so LiteGraph takes the lasso path for pen; restore immediately after — dispatchEvent
    // is synchronous so LiteGraph reads the patched value during the same call.
    const lg = window.LiteGraph;
    const savedBehavior = lg?.leftMouseClickBehavior;
    if (lg) lg.leftMouseClickBehavior = null;
    penTarget = dispatch("mousedown", e, 1);
    if (lg) lg.leftMouseClickBehavior = savedBehavior;
    const cur = readCursorAt(e.clientX, e.clientY);
    if (debugEnabled) {
      const t = penTarget;
      const sig = t === getCanvasEl() ? 'CANVAS' : `${t.tagName}${t.id ? '#'+t.id : ''}.${(t.className?.toString?.() ?? '').slice(0,40)}`;
      debugLog(`        → tgt=${sig} cur=${cur}`);
    }
    moveCursor(e.clientX, e.clientY, cur, true);
  }, { capture: true, passive: false });

  window.addEventListener("pointermove", (e) => {
    if (e[SYNTHETIC]) return;
    debugLog(`PTR-mv  ${e.pointerType.padEnd(6)} (${Math.round(e.clientX)},${Math.round(e.clientY)}) p=${e.pressure.toFixed(2)} btn=${e.buttons}`);
    if (!enabled || e.pointerType !== "pen") return;
    e.preventDefault();
    e.stopImmediatePropagation();
    // Pin move events to the down target while dragging so elements like the minimap
    // continue receiving pointermove and don't get stuck in a drag state.
    dispatch("mousemove", e, penDown ? 1 : 0, penDown ? penTarget : null);
    // Read cursor after dispatch — the canvas updates its own .style.cursor
    // in response to hover hit-testing during the mousemove.
    moveCursor(e.clientX, e.clientY, readCursorAt(e.clientX, e.clientY), penDown);
  }, { capture: true, passive: false });

  window.addEventListener("pointerup", (e) => {
    if (e[SYNTHETIC]) return;
    debugLog(`PTR-up  ${e.pointerType.padEnd(6)} (${Math.round(e.clientX)},${Math.round(e.clientY)}) p=${e.pressure.toFixed(2)} btn=${e.buttons}`);
    if (!enabled || e.pointerType !== "pen") return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const target = dispatch("mouseup", e, 0, penTarget);
    if (penDown && isTap(e.clientX, e.clientY)) dispatchClick(target, e);
    penDown = false;
    penTarget = null;
    moveCursor(e.clientX, e.clientY, readCursorAt(e.clientX, e.clientY), false);
  }, { capture: true, passive: false });

  window.addEventListener("pointercancel", (e) => {
    if (e[SYNTHETIC]) return;
    debugLog(`PTR-cx  ${e.pointerType.padEnd(6)} (${Math.round(e.clientX)},${Math.round(e.clientY)})`);
    if (!enabled || e.pointerType !== "pen") return;
    e.preventDefault();
    e.stopImmediatePropagation();
    dispatch("mouseup", e, 0, penTarget);
    penDown = false;
    penTarget = null;
  }, { capture: true, passive: false });

  // iOS fires TouchEvent(stylus) alongside PointerEvent(pen) for the same Apple Pencil contact.
  // Always suppress stylus touches so ComfyUI's touch handler never initiates a canvas pan.
  // On old iOS without PointerEvent support, also dispatch from here.
  const TOUCH_TO_MOUSE = {
    touchstart: "mousedown",
    touchmove: "mousemove",
    touchend: "mouseup",
    touchcancel: "mouseup",
  };

  for (const [touchType, mouseType] of Object.entries(TOUCH_TO_MOUSE)) {
    window.addEventListener(touchType, (e) => {
      for (const t of e.changedTouches) {
        const abbr = touchType.replace('touch','TCH-').replace('start','dn').replace('move','mv').replace('end','up').replace('cancel','cx');
        debugLog(`${abbr}  ${(t.touchType ?? 'n/a').padEnd(6)} (${Math.round(t.clientX)},${Math.round(t.clientY)}) n=${e.touches.length}`);
      }
      if (!enabled) return;
      const touch = Array.from(e.changedTouches).find(t => t.touchType === "stylus");
      if (!touch) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (window.PointerEvent) return;
      const src = {
        clientX: touch.clientX, clientY: touch.clientY,
        screenX: touch.screenX, screenY: touch.screenY,
        ctrlKey: e.ctrlKey, altKey: e.altKey,
        shiftKey: e.shiftKey, metaKey: e.metaKey,
        target: e.target,
      };
      const isDown = mouseType === "mousedown";
      const isUp = mouseType === "mouseup";
      if (isDown) {
        penDown = true;
        penDownX = touch.clientX;
        penDownY = touch.clientY;
      }
      const forcedTarget = (!isDown && penDown) ? penTarget : null;
      const target = dispatch(mouseType, src, isUp ? 0 : 1, forcedTarget);
      if (isDown) penTarget = target;
      if (isUp) {
        if (penDown && isTap(touch.clientX, touch.clientY)) dispatchClick(target, src);
        penDown = false;
        penTarget = null;
      }
      // Update visual cursor after dispatch (so canvas cursor changes apply).
      moveCursor(touch.clientX, touch.clientY, readCursorAt(touch.clientX, touch.clientY), penDown);
    }, { capture: true, passive: false });
  }
}

app.registerExtension({
  name: "comfyui.pensupport",

  init() {
    setupPenSupport();
  },

  async setup() {
    app.ui.settings.addSetting({
      id: "PenSupport.enabled",
      name: "PenSupport: Enable Apple Pencil as mouse",
      defaultValue: true,
      type: "boolean",
      onChange: (value) => {
        enabled = value;
        if (!value) destroyCursor();
      },
    });

    app.ui.settings.addSetting({
      id: "PenSupport.debug",
      name: "PenSupport: Show input debug overlay",
      defaultValue: false,
      type: "boolean",
      onChange: (value) => {
        debugEnabled = value;
        if (!value) removeDebugOverlay();
      },
    });
  },
});
