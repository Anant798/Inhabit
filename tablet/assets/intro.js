// Intro video for the phone page and the PC display: the vertical cut on portrait screens (phones),
// the landscape version of the same cut (same soundtrack) otherwise. It tries to play with sound;
// browsers may block sound until the first tap/click: then it plays muted with a "Sound on" button,
// and any tap, click or key turns the sound on. (The launcher's Edge window allows sound outright.)
// Fires "intro-done" on document when it ends or is skipped.
(() => {
  const intro = document.getElementById("intro");
  if (!intro) return;
  const video = intro.querySelector("video");
  const soundBtn = document.getElementById("sound");
  const done = () => document.dispatchEvent(new Event("intro-done"));
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) { intro.remove(); return done(); }

  // The page can pin it (the TV is always landscape); otherwise the screen's shape decides.
  const portrait = intro.dataset.orientation ? intro.dataset.orientation === "portrait" : matchMedia("(orientation: portrait)").matches;
  video.src = portrait ? "/assets/intro-vertical.mp4" : "/assets/intro-landscape.mp4";

  let gone = false;
  const hide = () => {
    if (gone) return;
    gone = true;
    intro.classList.add("gone");
    video.pause();
    setTimeout(() => intro.remove(), 700);
    done();
  };
  video.addEventListener("ended", hide);
  video.addEventListener("error", hide);
  document.getElementById("skip").addEventListener("click", hide);

  const unmute = () => { video.muted = false; soundBtn.hidden = true; video.play().catch(() => {}); };
  soundBtn.addEventListener("click", (e) => { e.stopPropagation(); unmute(); });
  intro.addEventListener("pointerdown", (e) => { if (video.muted && e.target.id !== "skip") unmute(); });
  addEventListener("keydown", () => { if (video.muted) unmute(); }, { once: true });

  video.muted = false;
  video.play().catch(() => {
    video.muted = true; // sound blocked until a tap/click/key
    soundBtn.hidden = false;
    video.play().catch(hide);
  });
})();
