import React, { useEffect, useRef, useState } from "react";

interface FluidBackgroundProps {
  darkMode: boolean;
}

export default function FluidBackground({ darkMode }: FluidBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [particlesCount, setParticlesCount] = useState(250);
  const [showNetwork, setShowNetwork] = useState(true);
  const [intensity, setIntensity] = useState(1); // multiplier for gravity/repulsion force

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    // Track mouse position
    const mouse = {
      x: -1000,
      y: -1000,
      radius: 180, // Influence area
    };

    interface Particle {
      x: number;
      y: number;
      originX: number;
      originY: number;
      vx: number;
      vy: number;
      radius: number;
      baseColor: string;
      alpha: number;
      angle: number;
      speed: number;
    }

    let particles: Particle[] = [];

    const initialize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
      particles = [];

      // Distribute particles in a smart grid structure + organic jitter
      const cols = Math.floor(Math.sqrt(particlesCount * (width / height)));
      const rows = Math.ceil(particlesCount / cols);
      const cellWidth = width / cols;
      const cellHeight = height / rows;

      for (let i = 0; i < particlesCount; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);

        // Put them near cell centers with some random offset
        const originX = col * cellWidth + cellWidth / 2 + (Math.random() - 0.5) * (cellWidth * 0.4);
        const originY = row * cellHeight + cellHeight / 2 + (Math.random() - 0.5) * (cellHeight * 0.4);

        particles.push({
          x: originX,
          y: originY,
          originX,
          originY,
          vx: (Math.random() - 0.5) * 0.4,
          vy: (Math.random() - 0.5) * 0.4,
          radius: Math.random() * 2 + 1.2,
          baseColor: darkMode ? "110, 231, 183" : "15, 107, 74", // Emerald tints
          alpha: Math.random() * 0.5 + 0.2,
          angle: Math.random() * Math.PI * 2,
          speed: Math.random() * 0.02 + 0.005,
        });
      }
    };

    initialize();

    // Resize listener
    const handleResize = () => {
      initialize();
    };

    // Mouse listeners
    const handleMouseMove = (e: MouseEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    };

    const handleMouseLeave = () => {
      mouse.x = -1000;
      mouse.y = -1000;
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseleave", handleMouseLeave);

    // Animation Loop
    const animate = (time: number) => {
      // Clear canvas with very subtle fade effect for motion trails
      ctx.clearRect(0, 0, width, height);

      // Loop over particles
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        // 1. Organic slow drift (brownian flow or wave pattern)
        p.angle += p.speed;
        const waveX = Math.sin(p.angle) * 0.25;
        const waveY = Math.cos(p.angle) * 0.25;

        // 2. Mouse Antigravity Repulsion
        const dx = p.x - mouse.x;
        const dy = p.y - mouse.y;
        const distSq = dx * dx + dy * dy;
        const dist = Math.sqrt(distSq);

        let forceX = 0;
        let forceY = 0;

        if (dist < mouse.radius) {
          // Push away force - stronger when closer (antigravity)
          const force = (1 - dist / mouse.radius) * 1.8 * intensity;
          const angle = Math.atan2(dy, dx);
          forceX = Math.cos(angle) * force;
          forceY = Math.sin(angle) * force;
        }

        // 3. Elastic Restoring Force (Spring physics back to home position)
        const springK = 0.025; // stiffness
        const returnX = (p.originX - p.x) * springK;
        const returnY = (p.originY - p.y) * springK;

        // 4. Update Velocities with friction/viscosity damping (fluid effect)
        const friction = 0.92;
        p.vx = (p.vx + returnX + forceX + waveX) * friction;
        p.vy = (p.vy + returnY + forceY + waveY) * friction;

        // 5. Update Positions
        p.x += p.vx;
        p.y += p.vy;

        // Bound validation inside safe limits
        if (p.x < 0) p.x = 0;
        if (p.x > width) p.x = width;
        if (p.y < 0) p.y = 0;
        if (p.y > height) p.y = height;

        // 6. Draw connection lines between nearby particles
        if (showNetwork) {
          for (let j = i + 1; j < particles.length; j++) {
            const p2 = particles[j];
            const dx2 = p.x - p2.x;
            const dy2 = p.y - p2.y;
            const distSq2 = dx2 * dx2 + dy2 * dy2;
            const linkMaxDist = 110;

            if (distSq2 < linkMaxDist * linkMaxDist) {
              const d2 = Math.sqrt(distSq2);
              const maxAlpha = darkMode ? 0.08 : 0.05;
              const linkAlpha = (1 - d2 / linkMaxDist) * maxAlpha;
              ctx.strokeStyle = `rgba(${p.baseColor}, ${linkAlpha})`;
              ctx.lineWidth = 0.75;
              ctx.beginPath();
              ctx.moveTo(p.x, p.y);
              ctx.lineTo(p2.x, p2.y);
              ctx.stroke();
            }
          }
        }

        // 7. Render Particle node
        const nodeAlphaMultiplier = darkMode ? 0.35 : 0.22;
        ctx.fillStyle = `rgba(${p.baseColor}, ${p.alpha * nodeAlphaMultiplier})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      animationFrameId = requestAnimationFrame(animate);
    };

    animationFrameId = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseleave", handleMouseLeave);
      cancelAnimationFrame(animationFrameId);
    };
  }, [particlesCount, showNetwork, intensity, darkMode]);

  // Small background fine-tune panel, styled beautifully
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
      <canvas ref={canvasRef} className="absolute inset-0 block w-full h-full" />
      
      {/* Visual background controls overlay - discrete and beautiful */}
      <div className="absolute bottom-4 left-4 z-40 p-2 sm:p-3 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md rounded-2xl border border-slate-200/50 dark:border-slate-800/50 text-[10px] sm:text-[11px] font-sans flex items-center gap-3 pointer-events-auto shadow-xs text-slate-600 dark:text-slate-400 select-none animate-in fade-in duration-700">
        <span className="font-extrabold uppercase tracking-wide text-slate-800 dark:text-slate-200 font-mono text-[9px]">
          🌊 Fluido Cuántico
        </span>
        
        <div className="flex items-center gap-1.5 border-l border-slate-200 dark:border-slate-800 pl-3">
          <button
            onClick={() => setParticlesCount(prev => prev === 100 ? 250 : prev === 250 ? 400 : 100)}
            className="px-1.5 py-0.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 bg-white/90 dark:bg-slate-950/90 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 transition-colors font-semibold"
            title="Ajustar densidad de partículas para rendimiento óptimo"
          >
            Densidad: {particlesCount === 100 ? "Baja" : particlesCount === 250 ? "Media" : "Alta"}
          </button>
          
          <button
            onClick={() => setShowNetwork(!showNetwork)}
            className={`px-1.5 py-0.5 rounded-lg border transition-colors font-semibold ${
              showNetwork 
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400" 
                : "bg-white/90 dark:bg-slate-950/90 border-slate-200 dark:border-slate-800 text-slate-400"
            }`}
            title="Mostrar u ocultar redes neuronales"
          >
            Red: {showNetwork ? "ON" : "OFF"}
          </button>

          <button
            onClick={() => setIntensity(prev => prev === 0.5 ? 1 : prev === 1 ? 1.8 : 0.5)}
            className="px-1.5 py-0.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 bg-white/90 dark:bg-slate-950/90 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 transition-colors font-semibold"
            title="Cambiar la fuerza de atracción/repulsión del mouse"
          >
            Antigravedad: {intensity === 0.5 ? "Suave" : intensity === 1 ? "Normal" : "Máxima"}
          </button>
        </div>
      </div>
    </div>
  );
}
