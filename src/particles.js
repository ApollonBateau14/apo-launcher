// Petites particules dorées brillantes qui flottent lentement vers le haut,
// façon "poussière magique". Rendu en canvas pour rester léger (pas de DOM par particule).

(function () {
  const canvas = document.getElementById('particles-canvas');
  const ctx = canvas.getContext('2d');

  let width, height;
  function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  const PARTICLE_COUNT = 45;

  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  function makeParticle() {
    return {
      x: randomBetween(0, width),
      y: randomBetween(0, height),
      radius: randomBetween(1, 3),
      speedY: randomBetween(0.15, 0.5),
      driftX: randomBetween(-0.15, 0.15),
      opacity: randomBetween(0.3, 0.9),
      twinkleSpeed: randomBetween(0.01, 0.03),
      twinklePhase: randomBetween(0, Math.PI * 2)
    };
  }

  const particles = Array.from({ length: PARTICLE_COUNT }, makeParticle);

  function draw() {
    ctx.clearRect(0, 0, width, height);

    for (const p of particles) {
      p.twinklePhase += p.twinkleSpeed;
      const twinkle = (Math.sin(p.twinklePhase) + 1) / 2; // 0..1
      const alpha = p.opacity * (0.5 + twinkle * 0.5);

      const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius * 4);
      gradient.addColorStop(0, `rgba(255, 215, 120, ${alpha})`);
      gradient.addColorStop(0.4, `rgba(255, 190, 80, ${alpha * 0.5})`);
      gradient.addColorStop(1, 'rgba(255, 190, 80, 0)');

      ctx.beginPath();
      ctx.fillStyle = gradient;
      ctx.arc(p.x, p.y, p.radius * 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.fillStyle = `rgba(255, 235, 190, ${alpha})`;
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();

      // Déplacement : lente montée façon "étincelles", léger flottement horizontal
      p.y -= p.speedY;
      p.x += p.driftX;

      if (p.y < -10) {
        p.y = height + 10;
        p.x = randomBetween(0, width);
      }
      if (p.x < -10) p.x = width + 10;
      if (p.x > width + 10) p.x = -10;
    }

    requestAnimationFrame(draw);
  }

  draw();
})();
