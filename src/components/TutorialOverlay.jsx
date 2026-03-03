import { useEffect, useState, useCallback, useRef } from "preact/hooks";
import {
  tutorialActive,
  tutorialStep,
  tutorialSteps,
  nextStep,
  prevStep,
  skipTutorial,
} from "../state/tutorial.js";

const PADDING = 10;
const TOOLTIP_GAP = 14;
const VIEWPORT_MARGIN = 12;

function getRect(selector) {
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return {
    x: r.x - PADDING,
    y: r.y - PADDING,
    w: r.width + PADDING * 2,
    h: r.height + PADDING * 2,
  };
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

export function TutorialOverlay() {
  const [rect, setRect] = useState(null);
  const tooltipRef = useRef(null);
  const rectRef = useRef(null);
  const active = tutorialActive.value;
  const stepIdx = tutorialStep.value;
  const step = tutorialSteps[stepIdx];
  const isWaiting = step?.waitFor ? !step.waitFor() : false;

  const missCountRef = useRef(0);

  // Keep a ref so the global click handler always has the latest rect
  rectRef.current = rect;

  const measure = useCallback(() => {
    if (!active) return;
    const step = tutorialSteps[stepIdx];
    if (!step) return;
    const r = getRect(step.target);
    if (r) {
      missCountRef.current = 0;
      setRect(r);
    } else {
      // Only skip after sustained misses (avoid skipping during transient re-renders)
      missCountRef.current += 1;
      if (missCountRef.current > 10) {
        missCountRef.current = 0;
        nextStep();
      }
    }
  }, [active, stepIdx]);

  // Re-measure after step change — delay to let view navigation render
  useEffect(() => {
    if (!active) return;

    // Immediate attempt, then retry after a frame for view transitions
    measure();
    const rafId = requestAnimationFrame(() => {
      measure();
    });

    window.addEventListener("resize", measure);

    // For waitFor steps or missing targets, poll until element appears
    let pollId;
    if (step?.waitFor || !document.querySelector(step?.target)) {
      pollId = setInterval(measure, 300);
    }
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", measure);
      if (pollId) clearInterval(pollId);
    };
  }, [active, stepIdx, measure]);

  if (!active || !rect) return null;

  const totalSteps = tutorialSteps.length;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Measure actual tooltip height when available, fallback to estimate
  const tooltipW = Math.min(300, vw - VIEWPORT_MARGIN * 2);
  const tooltipH = tooltipRef.current?.offsetHeight || 190;

  // Compute tooltip position based on preferred side,
  // then fall back if it would clip the viewport
  let tooltipX, tooltipY;
  const positions = [step.position, "right", "bottom", "left", "top"];

  for (const pos of positions) {
    switch (pos) {
      case "right":
        tooltipX = rect.x + rect.w + TOOLTIP_GAP;
        tooltipY = rect.y;
        break;
      case "left":
        tooltipX = rect.x - tooltipW - TOOLTIP_GAP;
        tooltipY = rect.y;
        break;
      case "bottom":
        tooltipX = rect.x;
        tooltipY = rect.y + rect.h + TOOLTIP_GAP;
        break;
      case "top":
        tooltipX = rect.x;
        tooltipY = rect.y - tooltipH - TOOLTIP_GAP;
        break;
      default:
        tooltipX = rect.x + rect.w + TOOLTIP_GAP;
        tooltipY = rect.y;
    }

    // Check if this position fits in the viewport
    const fitsX = tooltipX >= VIEWPORT_MARGIN && tooltipX + tooltipW <= vw - VIEWPORT_MARGIN;
    const fitsY = tooltipY >= VIEWPORT_MARGIN && tooltipY + tooltipH <= vh - VIEWPORT_MARGIN;
    if (fitsX && fitsY) break;
  }

  // Final viewport clamp as safety net
  tooltipX = clamp(tooltipX, VIEWPORT_MARGIN, vw - tooltipW - VIEWPORT_MARGIN);
  tooltipY = clamp(tooltipY, VIEWPORT_MARGIN, vh - tooltipH - VIEWPORT_MARGIN);

  // Handle backdrop click: skip tutorial only if clicking outside the
  // highlighted cutout area. Clicks inside the cutout are forwarded to
  // the real element underneath (e.g. the Connect button).
  const handleOverlayClick = (e) => {
    const r = rectRef.current;
    if (r) {
      const cx = e.clientX, cy = e.clientY;
      const inCutout = cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h;
      if (inCutout) {
        // Re-dispatch click to the real element under the cutout
        const below = document.elementsFromPoint(cx, cy)
          .find((el) => !el.closest(".tutorial-overlay"));
        if (below) below.click();
        return;
      }
    }
    skipTutorial();
  };

  return (
    <div class="tutorial-overlay" onClick={handleOverlayClick}>
      <svg class="tutorial-svg" viewBox={`0 0 ${vw} ${vh}`}>
        <defs>
          <mask id="tutorial-mask">
            <rect width="100%" height="100%" fill="white" />
            <rect
              x={rect.x}
              y={rect.y}
              width={rect.w}
              height={rect.h}
              rx="8"
              fill="black"
            />
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(0,0,0,0.6)"
          mask="url(#tutorial-mask)"
        />
      </svg>

      {/* Highlight ring */}
      <div
        class="tutorial-highlight-ring"
        style={{
          left: `${rect.x}px`,
          top: `${rect.y}px`,
          width: `${rect.w}px`,
          height: `${rect.h}px`,
        }}
      />

      {/* Tooltip — key forces re-mount for entry animation per step */}
      <div
        key={stepIdx}
        ref={tooltipRef}
        class="tutorial-tooltip"
        style={{
          left: `${tooltipX}px`,
          top: `${tooltipY}px`,
          width: `${tooltipW}px`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div class="tutorial-tooltip-header">
          <span class="tutorial-step-counter">
            Step {stepIdx + 1} of {totalSteps}
          </span>
          <button class="tutorial-btn-skip" onClick={skipTutorial}>
            Skip tour
          </button>
        </div>
        <h3 class="tutorial-tooltip-title">{step.title}</h3>
        <p class="tutorial-tooltip-body">{step.body}</p>
        <div class="tutorial-tooltip-footer">
          <div class="tutorial-dots">
            {tutorialSteps.map((_, i) => (
              <span
                key={i}
                class={`tutorial-dot${i === stepIdx ? " active" : ""}`}
              />
            ))}
          </div>
          <div class="tutorial-nav-btns">
            {stepIdx > 0 && !isWaiting && (
              <button class="tutorial-btn-back" onClick={prevStep}>
                Back
              </button>
            )}
            <button
              class="tutorial-btn-next"
              onClick={nextStep}
              disabled={isWaiting}
              style={isWaiting ? { opacity: 0.5, cursor: "not-allowed" } : {}}
            >
              {isWaiting
                ? "Waiting..."
                : stepIdx === totalSteps - 1
                  ? "Done"
                  : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
