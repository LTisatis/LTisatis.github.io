const root = document.documentElement;
const entry = document.querySelector<HTMLButtonElement>("#welcome-entry");
const characters = [...document.querySelectorAll<HTMLElement>(".corner-character")];
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
let leaving = false;
const animations: Animation[] = [];
const content = [...document.querySelectorAll<HTMLElement>("#top-row,#main-grid,#music-player,#motion-toggle")];

function pose(character: HTMLElement, index: number) {
  const rect = character.getBoundingClientRect();
  const mobile = innerWidth < 768;
  const style = getComputedStyle(character);
  const headSpan = Number(style.getPropertyValue("--head-span"));
  const headTop = Number(style.getPropertyValue("--head-top"));
  const headCenter = Number(style.getPropertyValue("--head-center"));
  const scale = (innerHeight * (mobile ? .32 : .70)) / (rect.height * headSpan);
  const headX = innerWidth * (index === 0 ? .16 : .84);
  const centerX = headX - (headCenter - .5) * rect.width * scale;
  const centerY = innerHeight * (mobile ? .48 : .05) - (headTop - .5) * rect.height * scale;
  return { x: centerX - (rect.left + rect.width / 2), y: centerY - (rect.top + rect.height / 2), scale, rect };
}

if (entry && characters.length === 2) {
  root.classList.replace("welcome-pending", "welcome-active");
  root.classList.add("welcome-active");
  content.forEach(element => { element.inert = true; });
  entry.focus({ preventScroll: true });
  characters.forEach((character, index) => {
    const p = pose(character, index);
    const final = `translate(${p.x}px, ${p.y}px) scale(${p.scale})`;
    character.style.transform = final;
    const startX = innerWidth * (index === 0 ? .43 : .57) - (p.rect.left + p.rect.width / 2);
    const initialScale = Math.min(p.scale * .4, innerWidth * .43 / p.rect.width);
    const startY = innerHeight + p.rect.height * initialScale * .45 - (p.rect.top + p.rect.height / 2);
    // A vertical lift bends into an outward sweep. Arc-length sampling keeps
    // the exponential slowdown consistent even where the curve turns.
    const curve = (t: number) => {
      const u = 1 - t;
      return {
        x: u ** 3 * startX + 3 * u ** 2 * t * startX + 3 * u * t ** 2 * ((startX + p.x) / 2) + t ** 3 * p.x,
        y: u ** 3 * startY + 3 * u ** 2 * t * (p.y + innerHeight * .12) + 3 * u * t ** 2 * p.y + t ** 3 * p.y,
      };
    };
    const arc = [{ t: 0, distance: 0, ...curve(0) }];
    for (let i = 1; i <= 120; i++) {
      const point = curve(i / 120);
      const previous = arc[i - 1];
      arc.push({ t: i / 120, distance: previous.distance + Math.hypot(point.x - previous.x, point.y - previous.y), ...point });
    }
    const normalOpacity = Number(getComputedStyle(character).opacity);
    const frames = Array.from({ length: 61 }, (_, step) => {
      const t = step / 60;
      const progress = (1 - Math.exp(-5 * t)) / (1 - Math.exp(-5));
      const fade = Math.min(1, t / .55);
      const opacity = fade * fade * (3 - 2 * fade) * normalOpacity;
      const distance = progress * arc[120].distance;
      const end = arc.findIndex(point => point.distance >= distance);
      const hi = Math.max(1, end < 0 ? 120 : end);
      const a = arc[hi - 1];
      const b = arc[hi];
      const fraction = (distance - a.distance) / (b.distance - a.distance || 1);
      const { x: px, y: py } = curve(a.t + (b.t - a.t) * fraction);
      const scale = initialScale + (p.scale - initialScale) * progress;
      const rotation = (index === 0 ? 9 : -9) * (1 - progress);
      return { offset: t, transform: `translate(${px}px, ${py}px) scale(${scale}) rotate(${rotation}deg)`, opacity };
    });
    if (!reducedMotion.matches) animations.push(character.animate(frames, {
      duration: 3000, delay: index * 140, easing: "linear", fill: "backwards",
    }));
  });
  function enterBlog() {
    if (leaving || !entry) return;
    leaving = true;
    const current = characters.map(character => ({ transform: getComputedStyle(character).transform, opacity: getComputedStyle(character).opacity }));
    animations.forEach(animation => { animation.cancel(); });
    root.classList.remove("welcome-active", "welcome-pending");
    root.classList.add("welcome-leaving");
    characters.forEach((character, index) => {
      character.style.transform = "";
      character.animate([current[index], { transform: "none", opacity: getComputedStyle(character).opacity }], { duration: reducedMotion.matches ? 0 : 1050, easing: "cubic-bezier(.22,1,.36,1)" });
    });
    content.forEach(element => { element.inert = false; });
    window.setTimeout(() => {
      root.classList.remove("welcome-leaving");
      entry.hidden = true;
      document.querySelector<HTMLAnchorElement>("#navbar a")?.focus({ preventScroll: true });
    }, reducedMotion.matches ? 0 : 700);
  }
  entry.addEventListener("click", enterBlog);
  entry.addEventListener("keydown", event => {
    if (event.key === "Escape") enterBlog();
    if (event.key === "Tab" && !leaving) event.preventDefault();
  });
  window.addEventListener("resize", () => {
    if (leaving) return;
    animations.forEach(animation => { animation.cancel(); });
    characters.forEach(character => { character.style.transform = ""; });
    characters.forEach((character, index) => {
      const p = pose(character, index);
      character.style.transform = `translate(${p.x}px, ${p.y}px) scale(${p.scale})`;
    });
  });
}

