import { useEffect, useRef } from "react";

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  phase: number;
};

export default function AmbientParticles({ theme }: { theme: "light" | "dark" }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", { alpha: true });
    if (!canvas || !context) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const pointer = { x: -1000, y: -1000 };
    let width = 0;
    let height = 0;
    let frame = 0;
    let time = 0;
    let particles: Particle[] = [];

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      width = bounds.width;
      height = bounds.height;
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(height * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      const count = Math.max(34, Math.min(76, Math.round((width * height) / 18000)));
      particles = Array.from({ length: count }, (_, index) => {
        const angle = index * 2.399963;
        const speed = 0.08 + ((index * 17) % 8) * 0.012;
        return {
          x: ((index * 193.7 + 47) % 997) / 997 * width,
          y: ((index * 347.1 + 71) % 991) / 991 * height,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          radius: 1.25 + (index % 4) * 0.22,
          phase: index * 0.91,
        };
      });
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest(".visual-settings")) {
        clearPointer();
        return;
      }
      const bounds = canvas.getBoundingClientRect();
      pointer.x = event.clientX - bounds.left;
      pointer.y = event.clientY - bounds.top;
    };
    const clearPointer = () => {
      pointer.x = -1000;
      pointer.y = -1000;
    };
    const draw = () => {
      if (reducedMotion.matches) {
        context.clearRect(0, 0, width, height);
        drawParticles(false);
        return;
      }
      drawParticles(true);
      frame = window.requestAnimationFrame(draw);
    };
    const drawParticles = (animate: boolean) => {
      context.clearRect(0, 0, width, height);
      time += animate ? 0.012 : 0;
      const tint = theme === "dark" ? [185, 157, 255] : [100, 77, 157];
      for (const particle of particles) {
        if (animate) {
          const dx = particle.x - pointer.x;
          const dy = particle.y - pointer.y;
          const distance = Math.hypot(dx, dy);
          if (distance < 115 && distance > 0) {
            const force = ((115 - distance) / 115) * 0.012;
            particle.vx += (dx / distance) * force;
            particle.vy += (dy / distance) * force;
          }
          particle.vx = particle.vx * 0.992 + Math.sin(time + particle.phase) * 0.0007;
          particle.vy = particle.vy * 0.992 + Math.cos(time * 0.83 + particle.phase) * 0.0007;
          particle.x += particle.vx;
          particle.y += particle.vy;
          if (particle.x < -6) particle.x = width + 5;
          if (particle.x > width + 6) particle.x = -5;
          if (particle.y < -6) particle.y = height + 5;
          if (particle.y > height + 6) particle.y = -5;
        }
      }
      const linkDistance = Math.min(145, Math.max(105, width * 0.09));
      for (let first = 0; first < particles.length; first += 1) {
        for (let second = first + 1; second < particles.length; second += 1) {
          const left = particles[first];
          const right = particles[second];
          const distance = Math.hypot(left.x - right.x, left.y - right.y);
          if (distance >= linkDistance) continue;
          const alpha = (1 - distance / linkDistance) * (theme === "dark" ? 0.105 : 0.12);
          context.strokeStyle = `rgba(${tint.join(",")},${alpha})`;
          context.lineWidth = 0.7;
          context.beginPath();
          context.moveTo(left.x, left.y);
          context.lineTo(right.x, right.y);
          context.stroke();
        }
      }
      for (const particle of particles) {
        const pulse = animate ? 0.82 + (Math.sin(time * 1.15 + particle.phase) + 1) * 0.12 : 0.9;
        const alpha = pulse * (theme === "dark" ? 0.44 : 0.38);
        context.beginPath();
        context.fillStyle = `rgba(${tint.join(",")},${alpha})`;
        context.shadowColor = `rgba(${tint.join(",")},${alpha * 0.85})`;
        context.shadowBlur = 9;
        context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        context.fill();
      }
      context.shadowBlur = 0;
    };

    resize();
    frame = window.requestAnimationFrame(draw);
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("blur", clearPointer);
    const onMotionPreferenceChange = () => {
      window.cancelAnimationFrame(frame);
      resize();
      frame = window.requestAnimationFrame(draw);
    };
    reducedMotion.addEventListener("change", onMotionPreferenceChange);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("blur", clearPointer);
      reducedMotion.removeEventListener("change", onMotionPreferenceChange);
    };
  }, [theme]);

  return <canvas ref={canvasRef} className="ambient-particles" aria-hidden="true" />;
}
