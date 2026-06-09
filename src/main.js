import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

// Prevent browser from saving scroll position
if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}

window.addEventListener('beforeunload', () => {
  window.scrollTo(0, 0);
});

window.addEventListener('load', () => {
  window.scrollTo(0, 0);
});

// Canvas & Renderer Setup
const canvas = document.getElementById('hero-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.64;
renderer.outputColorSpace = THREE.SRGBColorSpace;

// Scene & Camera
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 0, 5.5);

// Environment (reflections)
const pmrem = new THREE.PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();
scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;

// Lighting
const ambientLight = new THREE.AmbientLight(0xfff0dd, 0.55);
scene.add(ambientLight);

const keyLight = new THREE.DirectionalLight(0xffeedd, 1.6);
keyLight.position.set(-2, 4, 5);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xf5e8d0, 0.35);
fillLight.position.set(4, 1, -2);
scene.add(fillLight);

const hemiLight = new THREE.HemisphereLight(0xfff0dd, 0xcfc0ae, 0.4);
scene.add(hemiLight);

// Section Waypoints
const isMobile = window.innerWidth <= 768;
const isTab = window.innerWidth <= 1024 && !isMobile;

const BALL_SCALE = isMobile ? 0.6 : (isTab ? 0.8 : 0.97);
const FOOTER_SCALE = isMobile ? 0.3 : 0.5;

const SECTIONS = {
  hero: { x: isMobile ? 0 : (isTab ? -0.1 : -0.25), y: isMobile ? -1.0 : -0.25, z: 0, scale: BALL_SCALE },
  stats: { x: isMobile ? 0 : (isTab ? 0.8 : 1.5), y: isMobile ? 1.0 : 0.0, z: 0, scale: BALL_SCALE },
  how: { x: isMobile ? 0 : (isTab ? -0.6 : -1.15), y: isMobile ? 1.0 : 0.0, z: 0, scale: BALL_SCALE },
  footer: { x: isMobile ? 0 : 2.2, y: isMobile ? -0.5 : -1.0, z: isMobile ? -1.0 : -2.0, scale: FOOTER_SCALE },
};

let ball = null;
let baseScale = 1;
let currentSection = 'hero';
let isDragging = false;

// Auto-rotation
const BASE_SPEED = 0.003;
let autoVel = {
  x: (Math.random() - 0.5) * 0.003,
  y: BASE_SPEED + Math.random() * 0.002,
};

// Physics state
let velocity = { x: 0, y: 0 };
let prevMouse = { x: 0, y: 0 };
const DAMPING = 0.94;

// Load GLTF Model
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
const loader = new GLTFLoader();
loader.setDRACOLoader(dracoLoader);

const textureLoader = new THREE.TextureLoader();
const diffuseTex = textureLoader.load('/models/textures/Material_diffuse.jpeg');
diffuseTex.colorSpace = THREE.SRGBColorSpace;
diffuseTex.flipY = false;

loader.load('/models/scene.gltf', (gltf) => {
  const innerBall = gltf.scene;

  // Center the model so it rotates in place
  const box = new THREE.Box3().setFromObject(innerBall);
  const center = box.getCenter(new THREE.Vector3());
  innerBall.position.sub(center);

  const wrapper = new THREE.Group();
  wrapper.add(innerBall);

  // Normalize scale
  const size = box.getSize(new THREE.Vector3());
  baseScale = 2.4 / Math.max(size.x, size.y, size.z);
  wrapper.scale.setScalar(baseScale * SECTIONS.hero.scale * 0.25); // Start small for entrance
  wrapper.position.set(SECTIONS.hero.x, SECTIONS.hero.y - 0.8, SECTIONS.hero.z); // Start low

  // Material overrides
  wrapper.traverse((child) => {
    if (child.isMesh) {
      // Modern Three.js doesn't support the old SpecularGlossiness extension used by this model.
      // So we manually apply its diffuse texture and configure it as a standard PBR material.
      child.material = new THREE.MeshStandardMaterial({
        map: diffuseTex,
        roughness: 0.85,
        metalness: 0.0,
        envMapIntensity: 0.15,
        color: new THREE.Color(0xaaaaaa) // darken slightly for gritty street look
      });
    }
  });

  scene.add(wrapper);
  ball = wrapper; // Reassign to wrapper for rotation and scroll

  // Hide preloader
  const preloader = document.getElementById('preloader');
  if (preloader) {
    preloader.classList.add('hidden');
    setTimeout(() => preloader.remove(), 800); // Remove from DOM after fade out
  }

  ballEntrance();
});

function ballEntrance() {
  gsap.to(ball.scale, {
    x: baseScale * SECTIONS.hero.scale,
    y: baseScale * SECTIONS.hero.scale,
    z: baseScale * SECTIONS.hero.scale,
    duration: 1.3,
    ease: 'expo.out',
    delay: 0.5
  });

  gsap.to(ball.position, {
    y: SECTIONS.hero.y,
    duration: 1.3,
    ease: 'expo.out',
    delay: 0.5,
    onComplete: () => {
      canvas.classList.add('drag-enabled');
      setupScrollBall();
    }
  });
}

// Drag Physics
function onPointerDown(e) {
  if (currentSection !== 'hero') return;
  isDragging = true;
  prevMouse.x = e.clientX || e.touches?.[0].clientX;
  prevMouse.y = e.clientY || e.touches?.[0].clientY;
}

function onPointerMove(e) {
  if (!isDragging) return;
  const cx = e.clientX || e.touches?.[0].clientX;
  const cy = e.clientY || e.touches?.[0].clientY;

  const dx = cx - prevMouse.x;
  const dy = cy - prevMouse.y;

  velocity.y = dx * 0.006;
  velocity.x = dy * 0.006;

  if (ball) {
    ball.rotation.x += velocity.x;
    ball.rotation.y += velocity.y;
  }

  prevMouse.x = cx;
  prevMouse.y = cy;
}

function onPointerUp() {
  isDragging = false;
}

window.addEventListener('mousedown', onPointerDown);
window.addEventListener('mousemove', onPointerMove);
window.addEventListener('mouseup', onPointerUp);
window.addEventListener('touchstart', onPointerDown, { passive: true });
window.addEventListener('touchmove', onPointerMove, { passive: true });
window.addEventListener('touchend', onPointerUp);

// Scroll positioning
function setupScrollBall() {
  // Hero -> Stats
  ScrollTrigger.create({
    trigger: '#stats-section',
    start: 'top bottom',
    end: 'top top',
    scrub: 2,
    onEnter: () => { currentSection = 'stats'; canvas.classList.remove('drag-enabled'); },
    onLeaveBack: () => { currentSection = 'hero'; canvas.classList.add('drag-enabled'); },
    onUpdate: (self) => {
      if (!ball) return;
      const p = self.progress;
      ball.position.x = gsap.utils.interpolate(SECTIONS.hero.x, SECTIONS.stats.x, p);
      // Slight arc on y
      const arc = Math.sin(p * Math.PI) * 0.5;
      ball.position.y = gsap.utils.interpolate(SECTIONS.hero.y, SECTIONS.stats.y, p) + arc;
      ball.position.z = gsap.utils.interpolate(SECTIONS.hero.z, SECTIONS.stats.z, p);
    }
  });

  // Stats -> How
  ScrollTrigger.create({
    trigger: '#how-section',
    start: 'top bottom',
    end: 'top top',
    scrub: 2,
    onEnter: () => currentSection = 'how',
    onLeaveBack: () => currentSection = 'stats',
    onUpdate: (self) => {
      if (!ball) return;
      const p = self.progress;
      ball.position.x = gsap.utils.interpolate(SECTIONS.stats.x, SECTIONS.how.x, p);
      ball.position.y = gsap.utils.interpolate(SECTIONS.stats.y, SECTIONS.how.y, p);
    }
  });

  // How -> Footer
  ScrollTrigger.create({
    trigger: '#site-footer',
    start: 'top bottom',
    end: 'top top',
    scrub: 2,
    onEnter: () => currentSection = 'footer',
    onLeaveBack: () => currentSection = 'how',
    onUpdate: (self) => {
      if (!ball) return;
      const p = self.progress;
      ball.position.x = gsap.utils.interpolate(SECTIONS.how.x, SECTIONS.footer.x, p);
      ball.position.y = gsap.utils.interpolate(SECTIONS.how.y, SECTIONS.footer.y, p);
      ball.position.z = gsap.utils.interpolate(SECTIONS.how.z, SECTIONS.footer.z, p);
      const sc = gsap.utils.interpolate(SECTIONS.how.scale, SECTIONS.footer.scale, p);
      ball.scale.setScalar(baseScale * sc);
    }
  });
}

// UI Animations
const tl = gsap.timeline({ delay: 0.15 });

tl.to('.nav-logo', { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' }, 0.1)
  .to('.nav-links', { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' }, 0.15)
  .to('.lang-toggle', { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' }, 0.18)
  .to('.profile-btn', { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' }, 0.2)
  .to('.hamburger-btn', { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' }, 0.22)
  .to('#ph-badge', { opacity: 1, y: 0, duration: 0.7, ease: 'expo.out' }, 0.4)
  .to('#event-card', { opacity: 1, x: 0, duration: 1.1, ease: 'expo.out' }, 0.55)
  .to('#hero-text', { opacity: 1, x: 0, duration: 1.1, ease: 'expo.out' }, 0.65)
  .to('#nav-arrow', { opacity: 1, duration: 0.5, ease: 'power2.out' }, 1.1)
  .to('#sig-wrap', { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' }, 1.2)
  .to('.sp1', { strokeDashoffset: 0, duration: 1.6, ease: 'power2.inOut' }, 1.2)
  .to('.sp2', { strokeDashoffset: 0, duration: 1.0, ease: 'power2.inOut' }, 1.8)
  .to('.sp3', { strokeDashoffset: 0, duration: 0.7, ease: 'power2.inOut' }, 2.0);

// Scroll Triggered UI
ScrollTrigger.create({
  trigger: '#stats-section',
  start: 'top 75%',
  onEnter: () => gsap.to('.stat-card', { opacity: 1, y: 0, stagger: 0.1, duration: 0.8, ease: 'expo.out', delay: 0.1 })
});

ScrollTrigger.create({
  trigger: '#how-section',
  start: 'top 70%',
  onEnter: () => gsap.to('.step-item', { opacity: 1, x: 0, stagger: 0.15, duration: 0.9, ease: 'expo.out', delay: 0.1 })
});

// Event Card Hover (GSAP)
const eventCardEl = document.getElementById('event-card');
if (eventCardEl) {
  eventCardEl.addEventListener('mouseenter', () => gsap.to(eventCardEl, { scale: 1.035, y: -6, duration: 0.55, ease: 'power3.out', overwrite: 'auto' }));
  eventCardEl.addEventListener('mouseleave', () => gsap.to(eventCardEl, { scale: 1.0, y: 0, duration: 0.55, ease: 'power3.out', overwrite: 'auto' }));
}

// Navbar scroll class
window.addEventListener('scroll', () => {
  if (window.scrollY > 80) {
    document.querySelector('.navbar').classList.add('scrolled');
  } else {
    document.querySelector('.navbar').classList.remove('scrolled');
  }
});

// Render Loop
function animate() {
  requestAnimationFrame(animate);

  if (ball) {
    if (!isDragging) {
      // Momentum decay
      velocity.x *= DAMPING;
      velocity.y *= DAMPING;

      // If momentum is low, revert to auto rotation
      if (Math.abs(velocity.x) < 0.001 && Math.abs(velocity.y) < 0.001) {
        // Keep auto rotation direction aligned with last spin
        autoVel.x = (autoVel.x + velocity.x) * 0.9 + 0.0001;
        autoVel.y = (autoVel.y + velocity.y) * 0.9 + BASE_SPEED * 0.1;
        ball.rotation.x += autoVel.x;
        ball.rotation.y += autoVel.y;
      } else {
        ball.rotation.x += velocity.x;
        ball.rotation.y += velocity.y;
      }
    }
  }

  renderer.render(scene, camera);
}
animate();

// Resize Handler
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  ScrollTrigger.refresh();
});

// Localization
const translations = {
  en: {
    nav_play: "Play",
    nav_lead: "Leaderboard",
    nav_how: "How it works",
    nav_about: "About",
    profile: "My profile",
    hero_eyebrow: "JOIN GAME",
    hero_title0: "FIND YOUR",
    hero_title1: "STREET",
    hero_title2: "BALLERS",
    pricing: "$100 / Early Access",
    get_in: "Get In &rarr;",
    scroll: "scroll",
    drag: "&harr; drag to spin",
    stats_eyebrow: "By The Numbers",
    stats_title: "THE STREETS<br>ARE ALIVE.",
    stats_body: "From Tokyo to London, Lagos to NYC &mdash; ballers are running <span class=\"fifa-brand\"><img src=\"/trophy.svg\" class=\"trophy-icon\" alt=\"Trophy Icon\"> FIFA 26</span> games every single day.",
    stats_c1: "Active Courts",
    stats_c2: "Daily Matches",
    stats_c3: "Top Scorer",
    stats_c4: "Avg Game Rating",
    how_eyebrow: "HOW IT WORKS",
    how_title: "THREE STEPS<br>TO THE COURT",
    how_s1_t: "Find a Game",
    how_s1_b: "Browse live and upcoming street games near you. Filter by skill level, location, or time slot.",
    how_s2_t: "Join or Create",
    how_s2_b: "Tap to join instantly or spin up your own game in under 30 seconds. Set rules, capacity, and skill tier.",
    how_s3_t: "Build Your Rep",
    how_s3_b: "Every game earns you points. Climb the city leaderboard, unlock badges, get scouted.",
    get_on: "Get on the Court &rarr;",
    ph_featured: "Featured on <strong>Product Hunt</strong> #1",
    footer_tag: "The world's most premium street football network.",
    f_prod: "Product",
    f_p1: "Find Games",
    f_p2: "Leaderboard",
    f_p3: "Court Map",
    f_p4: "Create Event",
    f_comm: "Community",
    f_c1: "Players",
    f_c2: "Teams",
    f_c3: "Tournaments",
    f_c4: "Rankings",
    f_comp: "Company",
    f_co1: "About",
    f_co2: "Blog",
    f_co3: "Press Kit",
    f_stay: "Stay in the game",
    f_nl: "Drop your email. Get notified when games go live near you."
  },
  ru: {
    nav_play: "Играть",
    nav_lead: "Рейтинг",
    nav_how: "Как это работает",
    nav_about: "О нас",
    profile: "Мой профиль",
    hero_eyebrow: "В ИГРУ",
    hero_title0: "НАЙДИ",      // Find
    hero_title1: "СВОИХ",      // Your crew / Own
    hero_title2: "ИГРОКОВ",    // Players
    pricing: "₽10000 / Ранний доступ",
    get_in: "Войти &rarr;",
    scroll: "скролл",
    drag: "&harr; крутить",
    stats_eyebrow: "В цифрах",
    stats_title: "УЛИЦЫ<br>ЖИВУТ.",
    stats_body: "От Токио до Лондона, от Лагоса до Нью-Йорка &mdash; игроки гоняют в <span class=\"fifa-brand\"><img src=\"/trophy.svg\" class=\"trophy-icon\" alt=\"Trophy Icon\"> FIFA 26</span> каждый день.",
    stats_c1: "Площадки",
    stats_c2: "Матчи за день",
    stats_c3: "Бомбардир",
    stats_c4: "Рейтинг матча",
    how_eyebrow: "ИНСТРУКЦИЯ",
    how_title: "ТРИ ШАГА<br>ДО МАТЧА",
    how_s1_t: "Найди игру",
    how_s1_b: "Ищи матчи поблизости. Фильтруй по уровню игры, локации или времени.",
    how_s2_t: "Зайди или создай",
    how_s2_b: "Жми для входа или создай матч за 30 секунд. Задай правила, состав и уровень.",
    how_s3_t: "Качай репутацию",
    how_s3_b: "Зарабатывай очки. Поднимайся в рейтинге, открывай бейджи, привлекай скаутов.",
    get_on: "На корт &rarr;",
    ph_featured: "Топ-1 на <strong>Product Hunt</strong>",
    footer_tag: "Главная сеть уличного футбола в мире.",
    f_prod: "Продукт",
    f_p1: "Найти игру",
    f_p2: "Рейтинг",
    f_p3: "Карта кортов",
    f_p4: "Создать матч",
    f_comm: "Комьюнити",
    f_c1: "Игроки",
    f_c2: "Команды",
    f_c3: "Турниры",
    f_c4: "Топы",
    f_comp: "Компания",
    f_co1: "О нас",
    f_co2: "Блог",
    f_co3: "Пресс-кит",
    f_stay: "Будь в курсе",
    f_nl: "Оставь email. Получай уведомления о матчах поблизости."
  }
};

let currentLang = 'en';
const langToggle = document.getElementById('langToggle');
const langText = document.getElementById('langText');

if (langToggle) {
  langToggle.addEventListener('click', () => {
    currentLang = currentLang === 'en' ? 'ru' : 'en';
    langText.innerText = currentLang.toUpperCase();

    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (translations[currentLang][key]) {
        el.innerHTML = translations[currentLang][key];
      }
    });
  });
}

window.onload = () => {
  ScrollTrigger.refresh();
};

// Hamburger Menu Logic
const hamburgerBtn = document.getElementById('hamburgerBtn');
const mobileMenu = document.getElementById('mobileMenu');

if (hamburgerBtn && mobileMenu) {
  const menuIcon = hamburgerBtn.querySelector('.menu-icon');
  const closeIcon = hamburgerBtn.querySelector('.close-icon');

  hamburgerBtn.addEventListener('click', () => {
    const isActive = mobileMenu.classList.toggle('active');
    if (isActive) {
      menuIcon.style.display = 'none';
      closeIcon.style.display = 'block';
    } else {
      menuIcon.style.display = 'block';
      closeIcon.style.display = 'none';
    }
  });

  // Close menu on link click
  document.querySelectorAll('.mobile-link').forEach(link => {
    link.addEventListener('click', () => {
      mobileMenu.classList.remove('active');
      menuIcon.style.display = 'block';
      closeIcon.style.display = 'none';
    });
  });
}
