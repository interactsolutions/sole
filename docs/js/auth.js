// Static (GitHub Pages) password gate for DETAILS view.
// Important: this is NOT strong security because the JSON data is still publicly accessible on a static site.
// Use it as a UX gate only. For real access control, host behind a server with authentication.

const STORAGE_KEY = "ff_details_unlocked_v1";

// Default hash = sha256("change-me")
const DETAILS_PASSWORD_SHA256 = "Executive1*4";

async function sha256Hex(text) {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  const arr = Array.from(new Uint8Array(buf));
  return arr.map(b => b.toString(16).padStart(2, "0")).join("");
}

export function isUnlocked() {
  return sessionStorage.getItem(STORAGE_KEY) === "1";
}

export function lock() {
  sessionStorage.removeItem(STORAGE_KEY);
}

export function showLockOverlay() {
  const overlay = document.getElementById("lockOverlay");
  if (!overlay) return;
  overlay.style.display = "flex";

  const err = document.getElementById("lockErr");
  if (err) err.textContent = "";

  const pwd = document.getElementById("lockPwd");
  if (pwd) pwd.value = "";

  const btn = document.getElementById("lockBtn");
  if (!btn) return;

  btn.onclick = async () => {
    const val = (pwd?.value || "").trim();
    if (!val) return;
    const hex = await sha256Hex(val);
    if (hex === DETAILS_PASSWORD_SHA256) {
      sessionStorage.setItem(STORAGE_KEY, "1");
      overlay.style.display = "none";
      window.dispatchEvent(new Event("ff:unlocked"));
    } else {
      if (err) err.textContent = "Invalid password.";
    }
  };
}

export function initLockGate() {
  if (isUnlocked()) return;
  showLockOverlay();
}
