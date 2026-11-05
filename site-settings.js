import { database, ref, get, update } from './firebase-client.js';

const root = document.documentElement;
function applySettings(settings = {}) {
  const theme = settings.theme || {};
  if (theme.gold) root.style.setProperty('--g', theme.gold);
  if (theme.goldLight) root.style.setProperty('--g2', theme.goldLight);
  if (theme.navy) {
    root.style.setProperty('--b1', theme.navy);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.navy);
  }
  if (theme.blue) root.style.setProperty('--b2', theme.blue);

  const images = settings.images || {};
  const map = [
    ['homeHero', '.hero-visual'], ['shopHero', '.shop-page-hero .page-hero-art'], ['aboutHero', '.story-hero-art'],
    ['homeEditorial', '.editorial-section > img'], ['featureBanner', '.feature-banner']
  ];
  map.forAdmin = undefined;
  for (const [key, selector] of map) {
    if (!images[key]) continue;
    document.querySelectorAll(selector).forEach((element, index) => {
      if (key === 'featureBanner') element.style.backgroundImage = `linear-gradient(90deg,rgba(6,18,58,.96),rgba(6,18,58,.65)),url("${images[key]}")`;
      else if (element.tagName === 'IMG') element.src = images[key];
      else element.style.backgroundImage = `url("${images[key]}")`;
    });
  }
  ['slide1', 'slide2', 'slide3'].forEach((key, index) => {
    const slides = document.querySelectorAll('.hero-visual .s');
    if (images[key] && slides[index]) slides[index].style.backgroundImage = `url("${images[key]}")`;
  });
}

get(ref(database, 'siteSettings')).then(snapshot => applySettings(snapshot.val() || {})).catch(() => {});
window.saveSiteSettings = async function (settings) {
  await update(ref(database, 'siteSettings'), settings);
};
