function setTheme(theme: "light" | "dark") {
  document.documentElement.dataset.theme = theme;
  const button = document.querySelector<HTMLButtonElement>(".theme-toggle");
  if (!button) return;
  const dark = theme === "dark";
  button.textContent = dark ? "light" : "dark";
  button.setAttribute("aria-pressed", String(dark));
  button.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
}

function updateNavigation() {
  const nav = document.querySelector<HTMLElement>(".greedy-nav");
  const button = nav?.querySelector<HTMLButtonElement>("button");
  const visible = nav?.querySelector<HTMLUListElement>(".visible-links");
  const hidden = nav?.querySelector<HTMLUListElement>(".hidden-links");
  if (!nav || !button || !visible || !hidden) return;

  while (hidden.firstElementChild) visible.append(hidden.firstElementChild);
  button.classList.add("hidden");
  hidden.classList.add("hidden");

  button.classList.remove("hidden");
  const availableWidth = nav.clientWidth - button.offsetWidth - 30;
  while (visible.scrollWidth > availableWidth && visible.children.length > 1) {
    hidden.prepend(visible.lastElementChild!);
  }
  button.classList.toggle("hidden", hidden.children.length === 0);

  button.onclick = () => hidden.classList.toggle("hidden");
}

function initialisePage() {
  const savedTheme = localStorage.getItem("personal-website-theme") === "dark" ? "dark" : "light";
  setTheme(savedTheme);

  const themeButton = document.querySelector<HTMLButtonElement>(".theme-toggle");
  if (themeButton) {
    themeButton.onclick = () => {
      const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      localStorage.setItem("personal-website-theme", nextTheme);
      setTheme(nextTheme);
    };
  }

  const followButton = document.querySelector<HTMLButtonElement>(".author__urls-wrapper button");
  const authorUrls = document.querySelector<HTMLElement>(".author__urls");
  if (followButton && authorUrls) {
    followButton.onclick = () => {
      authorUrls.classList.toggle("author-urls-open");
    };
  }

  requestAnimationFrame(updateNavigation);
}

document.addEventListener("astro:page-load", initialisePage);
window.addEventListener("resize", updateNavigation, { passive: true });
initialisePage();
