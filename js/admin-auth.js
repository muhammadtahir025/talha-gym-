import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { ADMIN_ROLES, auth, firebaseReady, getUserAccess } from "./auth-service.js";

const gate = document.querySelector("#admin-auth-gate");
const gateMessage = document.querySelector("#admin-auth-message");
const shell = document.querySelector("#admin-shell");

const denyAccess = (message) => {
  gate.hidden = false;
  gateMessage.textContent = message;
  shell.hidden = true;
};

if (!firebaseReady) {
  denyAccess("Firebase is not configured. Add the web-app settings in js/firebase-config.js.");
} else {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.replace("login.html?next=admin");
      return;
    }

    try {
      const { role, profile } = await getUserAccess(user, true);
      if (!ADMIN_ROLES.includes(role)) {
        denyAccess("This account does not have permission to access the admin panel.");
        return;
      }

      document.querySelector("#admin-profile-name").textContent = profile.name || user.email || "ADMIN";
      document.querySelector("#admin-profile-role").textContent = role.replaceAll("_", " ");
      gate.hidden = true;
      shell.hidden = false;
      window.dispatchEvent(new CustomEvent("tgg-admin-authorized", { detail: { user, role, profile } }));
    } catch (error) {
      denyAccess(error.message || "Unable to verify admin access.");
    }
  });

  document.addEventListener("click", async (event) => {
    const control = event.target.closest("[data-admin-logout]");
    if (control) {
      event.preventDefault();
      try {
        await signOut(auth);
      } finally {
        window.location.replace("login.html");
      }
    }
  });
}
