import { useEffect, useRef, type ReactNode } from "react";

import type { AppPage } from "@/app/AppRouter";

import Header from "../components/layout/Header";
import Sidebar from "../components/layout/Sidebar";
import StatusBar from "../components/layout/StatusBar";

interface MainLayoutProps {
  children: ReactNode;
  currentPage: AppPage;
  onPageChange: (page: AppPage) => void;
}

interface MatrixCursorParticle {
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  lifeMs: number;
  maxLifeMs: number;
  size: number;
  growth: number;
}

const MATRIX_CURSOR_MAX_PARTICLES = 84;
const MATRIX_CURSOR_SAMPLE_GAP_PX = 6;
const MATRIX_CURSOR_TELEPORT_PX = 220;
const MATRIX_CURSOR_TELEPORT_IDLE_MS = 120;

function MatrixCursor() {
  const cursorRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    if (!finePointer.matches || reducedMotion.matches) {
      return undefined;
    }

    const canvas = cursorRef.current;
    const context = canvas?.getContext("2d", {alpha: true});
    if (!canvas || !context) {
      return undefined;
    }

    const smokeSprite = document.createElement("canvas");
    smokeSprite.width = 72;
    smokeSprite.height = 72;
    const smokeContext = smokeSprite.getContext("2d");
    const smokeGradient = smokeContext?.createRadialGradient(36, 36, 1, 36, 36, 35);
    if (smokeContext && smokeGradient) {
      smokeGradient.addColorStop(0, "rgba(122, 255, 163, 0.72)");
      smokeGradient.addColorStop(0.18, "rgba(33, 255, 103, 0.5)");
      smokeGradient.addColorStop(0.48, "rgba(7, 166, 61, 0.2)");
      smokeGradient.addColorStop(1, "rgba(0, 35, 13, 0)");
      smokeContext.fillStyle = smokeGradient;
      smokeContext.fillRect(0, 0, 72, 72);
    }

    let particles: MatrixCursorParticle[] = [];
    const pointer = {
      x: -64,
      y: -64,
      previousX: -64,
      previousY: -64,
      visible: false,
      interactive: false,
      pressed: false,
    };
    let animationFrame = 0;
    let lastFrameAt = performance.now();
    let lastPointerAt = 0;

    const resizeCanvas = () => {
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(window.innerWidth * pixelRatio);
      canvas.height = Math.round(window.innerHeight * pixelRatio);
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    };

    const drawHead = () => {
      if (!pointer.visible) {
        return;
      }

      const coreRadius = pointer.pressed ? 2.2 : pointer.interactive ? 4.2 : 3.2;
      const glowRadius = pointer.interactive ? 20 : 16;
      const glow = context.createRadialGradient(
        pointer.x,
        pointer.y,
        0,
        pointer.x,
        pointer.y,
        glowRadius,
      );
      glow.addColorStop(0, "rgba(236, 255, 242, 1)");
      glow.addColorStop(0.1, "rgba(111, 255, 157, 0.98)");
      glow.addColorStop(0.3, "rgba(28, 255, 103, 0.58)");
      glow.addColorStop(0.62, "rgba(4, 178, 62, 0.2)");
      glow.addColorStop(1, "rgba(0, 42, 14, 0)");

      context.globalAlpha = 1;
      context.fillStyle = glow;
      context.beginPath();
      context.arc(pointer.x, pointer.y, glowRadius, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = "#d9ffe5";
      context.beginPath();
      context.arc(pointer.x, pointer.y, coreRadius, 0, Math.PI * 2);
      context.fill();
    };

    const render = (now: number) => {
      const elapsedMs = Math.min(34, Math.max(0, now - lastFrameAt));
      const frameScale = elapsedMs / 16.667;
      lastFrameAt = now;
      context.clearRect(0, 0, window.innerWidth, window.innerHeight);
      context.globalCompositeOperation = "lighter";

      particles = particles.filter((particle) => {
        particle.lifeMs -= elapsedMs;
        if (particle.lifeMs <= 0) {
          return false;
        }

        particle.x += particle.velocityX * frameScale;
        particle.y += particle.velocityY * frameScale;
        particle.velocityX *= 0.982;
        particle.velocityY = particle.velocityY * 0.982 - 0.004 * frameScale;
        particle.size += particle.growth * frameScale;
        const lifeRatio = particle.lifeMs / particle.maxLifeMs;

        context.globalAlpha = Math.pow(lifeRatio, 1.55) * 0.55;
        context.drawImage(
          smokeSprite,
          particle.x - particle.size / 2,
          particle.y - particle.size / 2,
          particle.size,
          particle.size,
        );
        return true;
      });

      drawHead();
      context.globalAlpha = 1;
      context.globalCompositeOperation = "source-over";

      if (particles.length > 0) {
        animationFrame = window.requestAnimationFrame(render);
      } else {
        animationFrame = 0;
      }
    };

    const scheduleRender = () => {
      if (animationFrame === 0) {
        lastFrameAt = performance.now();
        animationFrame = window.requestAnimationFrame(render);
      }
    };

    const emitTrail = (x: number, y: number, now: number) => {
      const deltaX = x - pointer.previousX;
      const deltaY = y - pointer.previousY;
      const distance = Math.hypot(deltaX, deltaY);
      const staleJump =
        now - lastPointerAt > MATRIX_CURSOR_TELEPORT_IDLE_MS ||
        distance > MATRIX_CURSOR_TELEPORT_PX ||
        pointer.previousX < 0;

      if (!staleJump && distance >= 1) {
        const samples = Math.min(
          12,
          Math.max(1, Math.ceil(distance / MATRIX_CURSOR_SAMPLE_GAP_PX)),
        );
        const normalX = -deltaY / distance;
        const normalY = deltaX / distance;

        for (let index = 0; index < samples; index += 1) {
          const progress = index / samples;
          const jitter = (Math.random() - 0.5) * 3.5;
          const maxLifeMs = 360 + Math.random() * 250;
          particles.push({
            x: pointer.previousX + deltaX * progress + normalX * jitter,
            y: pointer.previousY + deltaY * progress + normalY * jitter,
            velocityX: normalX * (Math.random() - 0.5) * 0.22,
            velocityY: normalY * (Math.random() - 0.5) * 0.22 - Math.random() * 0.05,
            lifeMs: maxLifeMs,
            maxLifeMs,
            size: 8 + Math.random() * 7,
            growth: 0.11 + Math.random() * 0.09,
          });
        }

        if (particles.length > MATRIX_CURSOR_MAX_PARTICLES) {
          particles.splice(0, particles.length - MATRIX_CURSOR_MAX_PARTICLES);
        }
      }

      pointer.previousX = x;
      pointer.previousY = y;
    };

    const showAtPointer = (event: PointerEvent) => {
      const now = performance.now();
      emitTrail(event.clientX, event.clientY, now);
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.visible = true;
      pointer.interactive =
        event.target instanceof Element &&
        event.target.closest(
          'a, button:not(:disabled), summary, [role="button"], label[for], input, select, textarea',
        )
          ? true
          : false;
      lastPointerAt = now;
      canvas.dataset.visible = "true";
      scheduleRender();
    };

    const hide = () => {
      pointer.visible = false;
      pointer.previousX = -64;
      pointer.previousY = -64;
      particles = [];
      canvas.dataset.visible = "false";
      window.cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      context.clearRect(0, 0, window.innerWidth, window.innerHeight);
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        hide();
      }
    };

    const press = () => {
      pointer.pressed = true;
      scheduleRender();
    };

    const release = () => {
      pointer.pressed = false;
      scheduleRender();
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas, {passive: true});
    window.addEventListener("pointermove", showAtPointer, {passive: true});
    window.addEventListener("pointerdown", press, {passive: true});
    window.addEventListener("pointerup", release, {passive: true});
    window.addEventListener("pointercancel", release, {passive: true});
    window.addEventListener("blur", hide);
    document.documentElement.addEventListener("mouseleave", hide);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("resize", resizeCanvas);
      window.removeEventListener("pointermove", showAtPointer);
      window.removeEventListener("pointerdown", press);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      window.removeEventListener("blur", hide);
      document.documentElement.removeEventListener("mouseleave", hide);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.cancelAnimationFrame(animationFrame);
    };
  }, []);

  return (
    <canvas
      aria-hidden="true"
      className="matrix-cursor"
      data-visible="false"
      ref={cursorRef}
    />
  );
}

export default function MainLayout({
  children,
  currentPage,
  onPageChange,
}: MainLayoutProps) {
  return (
    <div className="cat-pro-shell flex h-screen flex-col bg-app-bg">
      <div aria-hidden="true" className="matrix-code-rain">
        <span>01アイウエオ7Zλ∑∆0110</span>
        <span>CATPRO101サシスセソ42Ξ010</span>
        <span>1101カキクケコHFT∇0101</span>
        <span>Δ010ナニヌネノ889λ11</span>
        <span>101マミムメモΣPRO001</span>
        <span>7F01ヤユヨξ110010</span>
        <span>λ10ラリルレロHFT77</span>
        <span>001ワヲンΩCAT101</span>
        <span>1010タチツテト∑∆10</span>
        <span>HOPUNハヒフヘホ010</span>
        <span>011Ξガギグゲゴλ01</span>
        <span>∇101バビブベボ77</span>
        <span>CAT01パピプペポΣ00</span>
        <span>1001ザジズゼゾΩ01</span>
        <span>HFTΔ01ダヂヅデド01</span>
        <span>010アZλカΣサ∆タ101</span>
      </div>

      <MatrixCursor />

      <Header
        onPageChange={onPageChange}
      />

      <div className="cat-pro-layout-body flex min-h-0 flex-1">
        <Sidebar
          currentPage={currentPage}
          onPageChange={onPageChange}
        />

        <main className="cat-pro-main min-w-0 flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>

      <StatusBar />
    </div>
  );
}
