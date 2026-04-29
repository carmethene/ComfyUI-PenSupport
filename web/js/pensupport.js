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

const CURSOR_RING_PX = 22;
const CURSOR_DOT_PX  = 8;
const CURSOR_HIDE_MS = 600;

let cursorEl = null;
let cursorTimer = null;

function getCursor() {
  if (cursorEl) return cursorEl;
  cursorEl = document.createElement('div');
  cursorEl.id = 'pensupport-cursor';
  cursorEl.style.cssText =
    'position:fixed;pointer-events:none;z-index:999998;border-radius:50%;' +
    `width:${CURSOR_RING_PX}px;height:${CURSOR_RING_PX}px;` +
    'border:1.5px solid rgba(255,255,255,0.9);' +
    'box-shadow:0 0 0 1px rgba(0,0,0,0.45);' +
    'transform:translate(-50%,-50%);' +
    // Animate size/opacity only — animating position introduces visible lag.
    'transition:width 80ms ease,height 80ms ease,opacity 150ms ease;' +
    'opacity:0;';
  const dot = document.createElement('div');
  dot.style.cssText =
    'position:absolute;top:50%;left:50%;' +
    'width:3px;height:3px;border-radius:50%;' +
    'background:rgba(255,255,255,0.9);' +
    'box-shadow:0 0 0 0.5px rgba(0,0,0,0.45);' +
    'transform:translate(-50%,-50%);';
  cursorEl.appendChild(dot);
  document.body.appendChild(cursorEl);
  return cursorEl;
}

function moveCursor(x, y) {
  const el = getCursor();
  el.style.left = x + 'px';
  el.style.top  = y + 'px';
  el.style.opacity = '1';
  clearTimeout(cursorTimer);
  cursorTimer = setTimeout(() => { if (cursorEl) cursorEl.style.opacity = '0'; }, CURSOR_HIDE_MS);
}

function setCursorPressed(down) {
  if (!cursorEl) return;
  const px = down ? CURSOR_DOT_PX : CURSOR_RING_PX;
  cursorEl.style.width  = px + 'px';
  cursorEl.style.height = px + 'px';
}

function destroyCursor() {
  clearTimeout(cursorTimer);
  if (cursorEl) { cursorEl.remove(); cursorEl = null; }
}

const MOUSE_TO_PTR = { mousedown: 'pointerdown', mousemove: 'pointermove', mouseup: 'pointerup' };

function setupPenSupport() {
  let penDown = false;
  let penDownX = 0;
  let penDownY = 0;

  function getCanvasEl() {
    return app.canvas?.canvas ?? document.querySelector('canvas');
  }

  // elementFromPoint on iPad can return an overlay div that is a sibling of the canvas,
  // not an ancestor — events dispatched there never reach LiteGraph's canvas listener.
  function dispatch(mouseType, src, buttons) {
    const canvasEl = getCanvasEl();
    let target = document.elementFromPoint(src.clientX, src.clientY) ?? src.target;
    if (canvasEl) {
      const r = canvasEl.getBoundingClientRect();
      const inCanvas = src.clientX >= r.left && src.clientX <= r.right &&
                       src.clientY >= r.top  && src.clientY <= r.bottom;
      // Only override to canvas when elementFromPoint found a non-interactive element
      // (e.g. a transparent overlay sibling of the canvas). The canvas fills the full
      // viewport, so sidebar panels also fall within its bounds — don't override those.
      if (inCanvas && !target.closest('button, a, input, select, textarea, [role="button"]')) {
        target = canvasEl;
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
    setCursorPressed(true);
    penDown = true;
    penDownX = e.clientX;
    penDownY = e.clientY;
    // ComfyUI sets leftMouseClickBehavior='panning' on touch devices. Clear it temporarily
    // so LiteGraph takes the lasso path for pen; restore immediately after — dispatchEvent
    // is synchronous so LiteGraph reads the patched value during the same call.
    const lg = window.LiteGraph;
    const savedBehavior = lg?.leftMouseClickBehavior;
    if (lg) lg.leftMouseClickBehavior = null;
    dispatch("mousedown", e, 1);
    if (lg) lg.leftMouseClickBehavior = savedBehavior;
  }, { capture: true, passive: false });

  window.addEventListener("pointermove", (e) => {
    if (e[SYNTHETIC]) return;
    debugLog(`PTR-mv  ${e.pointerType.padEnd(6)} (${Math.round(e.clientX)},${Math.round(e.clientY)}) p=${e.pressure.toFixed(2)} btn=${e.buttons}`);
    if (!enabled || e.pointerType !== "pen") return;
    moveCursor(e.clientX, e.clientY);
    e.preventDefault();
    e.stopImmediatePropagation();
    dispatch("mousemove", e, penDown ? 1 : 0);
  }, { capture: true, passive: false });

  window.addEventListener("pointerup", (e) => {
    if (e[SYNTHETIC]) return;
    debugLog(`PTR-up  ${e.pointerType.padEnd(6)} (${Math.round(e.clientX)},${Math.round(e.clientY)}) p=${e.pressure.toFixed(2)} btn=${e.buttons}`);
    if (!enabled || e.pointerType !== "pen") return;
    e.preventDefault();
    e.stopImmediatePropagation();
    setCursorPressed(false);
    const target = dispatch("mouseup", e, 0);
    if (penDown && isTap(e.clientX, e.clientY)) dispatchClick(target, e);
    penDown = false;
  }, { capture: true, passive: false });

  window.addEventListener("pointercancel", (e) => {
    if (e[SYNTHETIC]) return;
    debugLog(`PTR-cx  ${e.pointerType.padEnd(6)} (${Math.round(e.clientX)},${Math.round(e.clientY)})`);
    if (!enabled || e.pointerType !== "pen") return;
    e.preventDefault();
    e.stopImmediatePropagation();
    setCursorPressed(false);
    dispatch("mouseup", e, 0);
    penDown = false;
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
      const isUp = mouseType === "mouseup";
      if (mouseType === "mousedown") {
        setCursorPressed(true);
        penDown = true;
        penDownX = touch.clientX;
        penDownY = touch.clientY;
      } else if (mouseType === "mousemove") {
        moveCursor(touch.clientX, touch.clientY);
      }
      const target = dispatch(mouseType, src, isUp ? 0 : 1);
      if (isUp) {
        setCursorPressed(false);
        if (penDown && isTap(touch.clientX, touch.clientY)) dispatchClick(target, src);
        penDown = false;
      }
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
