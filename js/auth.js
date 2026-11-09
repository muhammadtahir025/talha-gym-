import {
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { auth, firebaseReady, getUserAccess } from "./auth-service.js";

const form = document.querySelector("#login-form");
const status = form?.querySelector(".form-status");
const submitButton = form?.querySelector("button[type='submit']");
const emailInput = form?.querySelector("#login-email");
const passwordInput = form?.querySelector("#login-password");
const resetButtons = [document.querySelector("#forgot-password"), document.querySelector("#forgot-password-button")].filter(Boolean);

const setStatus = (message, isError = false) => {
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("error", isError);
};

const getRedirectPath = (role) => role === "MEMBER" ? "member.html" : "admin.html";

if (form) {
  form.dataset.firebaseAuth = "true";

  if (!firebaseReady) {
    setStatus("Firebase is not configured. Add the web-app settings in js/firebase-config.js.", true);
  } else {
    onAuthStateChanged(auth, async (user) => {
      if (!user) return;
      try {
        const { role } = await getUserAccess(user, true);
        window.location.replace(getRedirectPath(role));
      } catch (error) {
        setStatus(error.message, true);
      }
    });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!firebaseReady) {
      setStatus("Firebase is not configured. Add the web-app settings in js/firebase-config.js.", true);
      return;
    }

    const email = emailInput.value.trim();
    const password = passwordInput.value;
    if (!email || !password) {
      setStatus("Enter your email address and password.", true);
      return;
    }

    submitButton.disabled = true;
    setStatus("Signing in...");
    try {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      const { role } = await getUserAccess(credential.user, true);
      window.location.replace(getRedirectPath(role));
    } catch (error) {
      const messages = {
        "auth/invalid-credential": "Email or password is incorrect.",
        "auth/invalid-email": "Enter a valid email address.",
        "auth/too-many-requests": "Too many attempts. Try again later.",
        "permission-denied": "Your account profile is unavailable. Contact the gym administrator."
      };
      setStatus(messages[error.code] || error.message || "Unable to sign in.", true);
    } finally {
      submitButton.disabled = false;
    }
  });

  resetButtons.forEach((button) => button.addEventListener("click", async (event) => {
    event.preventDefault();
    if (!firebaseReady) {
      setStatus("Firebase is not configured. Add the web-app settings in js/firebase-config.js.", true);
      return;
    }
    const email = emailInput.value.trim();
    if (!email) {
      setStatus("Enter your email address first to receive a password reset link.", true);
      emailInput.focus();
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      setStatus("If an account exists for that email, a password reset link has been sent.");
    } catch (error) {
      setStatus(error.message || "Unable to send the password reset email.", true);
    }
  }));
}
