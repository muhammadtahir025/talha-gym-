document.addEventListener("DOMContentLoaded", () => {
  const header = document.querySelector(".site-header");
  const navToggle = document.querySelector(".nav-toggle");
  const nav = document.querySelector(".main-nav");
  const navLinks = document.querySelectorAll(".main-nav a");
  const revealItems = document.querySelectorAll(".reveal");
  const hero = document.querySelector(".hero");
  const heroVideo = document.querySelector(".hero-video");

  const setHeaderState = () => {
    if (!header) return;
    if (window.scrollY > 18) {
      header.classList.add("scrolled");
    } else {
      header.classList.remove("scrolled");
    }
  };

  const setActiveNav = () => {
    const currentPath = window.location.pathname.split("/").pop() || "index.html";
    navLinks.forEach((link) => {
      const href = link.getAttribute("href");
      const match = href === currentPath || (currentPath === "" && href === "index.html");
      link.classList.toggle("active", Boolean(match));
    });
  };

  const initMobileNav = () => {
    if (!navToggle || !nav) return;

    navToggle.addEventListener("click", () => {
      const expanded = navToggle.getAttribute("aria-expanded") === "true";
      navToggle.setAttribute("aria-expanded", String(!expanded));
      nav.classList.toggle("open");
    });

    navLinks.forEach((link) => {
      link.addEventListener("click", () => {
        nav.classList.remove("open");
        navToggle.setAttribute("aria-expanded", "false");
      });
    });
  };

  const initRevealAnimations = () => {
    if (!revealItems.length) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });

    revealItems.forEach((item) => observer.observe(item));
  };

  const initHeroFallback = () => {
    if (!hero || !heroVideo) return;

    const video = heroVideo;
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.setAttribute("muted", "");
    video.setAttribute("playsinline", "");

    const tryPlay = () => {
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            hero.classList.remove("is-fallback");
          })
          .catch(() => {
            // Browsers that block initial autoplay will play on first interaction
            const playOnInteract = () => {
              video.play().then(() => {
                hero.classList.remove("is-fallback");
              }).catch(() => {});
              window.removeEventListener("touchstart", playOnInteract);
              window.removeEventListener("click", playOnInteract);
              window.removeEventListener("scroll", playOnInteract);
            };
            window.addEventListener("touchstart", playOnInteract, { once: true, passive: true });
            window.addEventListener("click", playOnInteract, { once: true });
            window.addEventListener("scroll", playOnInteract, { once: true, passive: true });
          });
      }
    };

    video.addEventListener("canplay", () => {
      hero.classList.remove("is-fallback");
      tryPlay();
    }, { once: true });

    video.addEventListener("loadeddata", () => {
      hero.classList.remove("is-fallback");
      tryPlay();
    }, { once: true });

    video.addEventListener("error", () => {
      if (video.error) {
        hero.classList.add("is-fallback");
      }
    });

    if (video.readyState >= 2) {
      hero.classList.remove("is-fallback");
      tryPlay();
    } else {
      tryPlay();
    }
  };

  const initMediaFallbacks = () => {
    document.querySelectorAll("img").forEach((media) => {
      media.addEventListener("error", () => {
        const wrapper = media.closest(".gallery-item-card, .feature-visual, .feature-image, .media-block, .ustad-photo, .trainer-photo, .trainer-thumb, .gallery-item, .facilities-visual") || media.parentElement;
        if (wrapper) {
          wrapper.classList.add("media-missing");
        }
        media.style.display = "none";
      });
    });
  };

  const initMembershipForm = () => {
    if (document.querySelector("#public-membership-plans") || window.location.pathname.includes("membership.html")) return;
    const form = document.querySelector("#membership-form");
    if (!form) return;

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const name = form.querySelector("#member-name");
      const phone = form.querySelector("#member-phone");
      const plan = form.querySelector("#member-plan");
      const message = form.querySelector("#member-message");
      const status = form.querySelector(".form-status");

      const nameVal = name?.value.trim() || "";
      const phoneVal = phone?.value.trim() || "";
      const planVal = plan?.value || "";
      const planText = plan?.selectedOptions?.[0]?.textContent || planVal;
      const msgVal = message?.value.trim() || "";

      if (!nameVal || !phoneVal || !planVal) {
        status.textContent = "Please provide your name, phone number, and selected plan.";
        status.classList.add("error");
        return;
      }

      status.classList.remove("error");
      const waText = encodeURIComponent(`Hello TALHA GOLD GYM! My name is ${nameVal} (Phone: ${phoneVal}). I would like to join with the ${planText} plan.${msgVal ? ` Note: ${msgVal}` : ""}`);
      status.innerHTML = `Request ready! <a href="https://wa.me/923703418826?text=${waText}" target="_blank" rel="noopener" class="btn btn--primary" style="display:inline-flex;margin-top:12px;padding:8px 18px;min-height:auto;font-size:0.82rem;">SEND VIA WHATSAPP</a>`;
    });
  };

  const initContactForm = () => {
    const form = document.querySelector("#contact-form");
    if (!form) return;

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const name = form.querySelector("#contact-name");
      const phone = form.querySelector("#contact-phone");
      const email = form.querySelector("#contact-email");
      const message = form.querySelector("#contact-message");
      const status = form.querySelector(".form-status");

      const nameVal = name?.value.trim() || "";
      const phoneVal = phone?.value.trim() || "";
      const emailVal = email?.value.trim() || "";
      const msgVal = message?.value.trim() || "";

      if (!nameVal) {
        status.textContent = "Name is required.";
        status.classList.add("error");
        return;
      }

      if (!phoneVal) {
        status.textContent = "Phone number is required.";
        status.classList.add("error");
        return;
      }

      if (emailVal && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
        status.textContent = "Please enter a valid email address.";
        status.classList.add("error");
        return;
      }

      if (!msgVal) {
        status.textContent = "Message is required.";
        status.classList.add("error");
        return;
      }

      status.classList.remove("error");
      const waText = encodeURIComponent(`Hello TALHA GOLD GYM! Inquiry from ${nameVal} (Phone: ${phoneVal}${emailVal ? `, Email: ${emailVal}` : ""}):\n${msgVal}`);
      status.innerHTML = `Message received! <a href="https://wa.me/923703418826?text=${waText}" target="_blank" rel="noopener" class="btn btn--primary" style="display:inline-flex;margin-top:12px;padding:8px 18px;min-height:auto;font-size:0.82rem;">SEND ON WHATSAPP</a>`;
      form.reset();
    });
  };

  const initLoginForm = () => {
    const form = document.querySelector("#login-form");
    if (!form || form.dataset.firebaseAuth === "true") return;

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const username = form.querySelector("#login-email");
      const password = form.querySelector("#login-password");
      const status = form.querySelector(".form-status");

      if (!username.value.trim() || !password.value.trim()) {
        status.textContent = "Please enter your email/username and password.";
        status.classList.add("error");
        return;
      }

      status.classList.remove("error");
      status.textContent = "Verifying credentials...";
    });
  };

  const initTrainerModals = () => {
    const modal = document.querySelector("#trainer-modal");
    if (!modal) return;

    const panel = modal.querySelector(".modal-panel");
    const buttons = document.querySelectorAll("[data-trainer]");
    const closeBtn = modal.querySelector(".modal-close");

    const openModal = (name, role, text) => {
      modal.classList.add("open");
      const nameEl = modal.querySelector("#trainer-name");
      const roleEl = modal.querySelector("#trainer-role");
      const descEl = modal.querySelector("#trainer-description");
      if (nameEl) nameEl.textContent = name || "Profile";
      if (roleEl) roleEl.textContent = role || "Coach";
      if (descEl) descEl.textContent = text || "";
    };

    buttons.forEach((button) => {
      button.addEventListener("click", () => {
        openModal(button.dataset.name, button.dataset.role, button.dataset.bio);
      });
    });

    if (closeBtn) closeBtn.addEventListener("click", () => modal.classList.remove("open"));
    modal.addEventListener("click", (event) => {
      if (event.target === modal) modal.classList.remove("open");
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && modal.classList.contains("open")) modal.classList.remove("open");
    });
  };

  const initGallery = () => {
    const gallery = document.querySelector(".gallery-masonry");
    if (!gallery) return;

    const filterButtons = document.querySelectorAll(".filter-btn");
    const lightbox = document.querySelector("#gallery-lightbox");
    if (!lightbox) return;

    const items = Array.from(gallery.querySelectorAll(".gallery-item-card"));
    const noResults = document.querySelector(".no-results");
    let currentIndex = 0;

    const filterItems = (category) => {
      let visible = 0;

      items.forEach((item) => {
        const matches = category === "all" || item.dataset.category === category;
        item.classList.toggle("is-hidden", !matches);
        if (matches) visible += 1;
      });

      if (noResults) {
        noResults.classList.toggle("visible", visible === 0);
      }
    };

    filterButtons.forEach((button) => {
      button.addEventListener("click", () => {
        filterButtons.forEach((btn) => btn.classList.toggle("active", btn === button));
        filterItems(button.dataset.filter);
      });
    });

    const openLightbox = (index) => {
      const visibleItems = items.filter((item) => !item.classList.contains("is-hidden"));
      if (!visibleItems.length) return;
      const item = visibleItems[index] || visibleItems[0];
      currentIndex = visibleItems.indexOf(item);
      const media = item.querySelector("img, video");
      if (!media) return;

      const inner = lightbox.querySelector(".lightbox-inner");
      if (!inner) return;

      const currentMedia = inner.querySelector("#lightbox-media");
      const clone = media.cloneNode(true);
      clone.id = "lightbox-media";

      if (clone.tagName === "VIDEO") {
        const source = media.querySelector("source");
        if (source && (!clone.src || clone.src === window.location.href)) {
          clone.src = source.getAttribute("src") || source.src;
        }
        clone.setAttribute("controls", "controls");
        clone.controls = true;
        clone.muted = false;
        clone.autoplay = true;
        clone.currentTime = 0;
        clone.play().catch(() => {});
      }

      if (currentMedia) {
        if (currentMedia.tagName === "VIDEO") {
          currentMedia.pause();
        }
        currentMedia.replaceWith(clone);
      } else {
        inner.appendChild(clone);
      }

      lightbox.classList.add("open");
    };

    items.forEach((item, index) => {
      item.addEventListener("click", () => openLightbox(index));
    });

    const closeLightbox = () => {
      lightbox.classList.remove("open");
      const currentMedia = lightbox.querySelector("#lightbox-media");
      if (currentMedia && currentMedia.tagName === "VIDEO") {
        currentMedia.pause();
      }
    };

    const closeBtn = document.querySelector("#lightbox-close");
    if (closeBtn) closeBtn.addEventListener("click", closeLightbox);

    const prevBtn = document.querySelector("#lightbox-prev");
    if (prevBtn) {
      prevBtn.addEventListener("click", () => {
        const visibleItems = items.filter((item) => !item.classList.contains("is-hidden"));
        if (!visibleItems.length) return;
        currentIndex = (currentIndex - 1 + visibleItems.length) % visibleItems.length;
        openLightbox(currentIndex);
      });
    }

    const nextBtn = document.querySelector("#lightbox-next");
    if (nextBtn) {
      nextBtn.addEventListener("click", () => {
        const visibleItems = items.filter((item) => !item.classList.contains("is-hidden"));
        if (!visibleItems.length) return;
        currentIndex = (currentIndex + 1) % visibleItems.length;
        openLightbox(currentIndex);
      });
    }

    lightbox.addEventListener("click", (event) => {
      if (event.target === lightbox) closeLightbox();
    });

    document.addEventListener("keydown", (event) => {
      if (!lightbox.classList.contains("open")) return;
      if (event.key === "Escape") closeLightbox();
      if (event.key === "ArrowRight") nextBtn?.click();
      if (event.key === "ArrowLeft") prevBtn?.click();
    });
  };

  /* ========================
     GYM IMAGE SLIDER
  ======================== */
  const initGymSlider = () => {
    const slider = document.querySelector("#gymSlider");
    if (!slider) return;

    const track = slider.querySelector("#sliderTrack");
    const slides = Array.from(track ? track.querySelectorAll(".slide") : []);
    const dotsContainer = slider.querySelector("#sliderDots");
    const prevBtn = slider.querySelector("#sliderPrev");
    const nextBtn = slider.querySelector("#sliderNext");

    if (!slides.length) return;

    let current = 0;
    let autoTimer = null;
    const DELAY = 4000;

    // Create dots
    slides.forEach((_, i) => {
      const dot = document.createElement("button");
      dot.className = "slider-dot" + (i === 0 ? " is-active" : "");
      dot.setAttribute("aria-label", `Go to slide ${i + 1}`);
      dot.addEventListener("click", () => goTo(i));
      if (dotsContainer) dotsContainer.appendChild(dot);
    });

    const getDots = () => dotsContainer ? Array.from(dotsContainer.querySelectorAll(".slider-dot")) : [];

    const goTo = (index) => {
      slides[current].classList.remove("is-active");
      getDots()[current]?.classList.remove("is-active");

      current = (index + slides.length) % slides.length;

      slides[current].classList.add("is-active");
      getDots()[current]?.classList.add("is-active");

      if (track) {
        track.style.transform = `translateX(-${current * 100}%)`;
      }
    };

    const startAuto = () => {
      clearInterval(autoTimer);
      autoTimer = setInterval(() => goTo(current + 1), DELAY);
    };

    const stopAuto = () => clearInterval(autoTimer);

    // Initialize first slide
    slides[0].classList.add("is-active");

    prevBtn?.addEventListener("click", () => { goTo(current - 1); stopAuto(); startAuto(); });
    nextBtn?.addEventListener("click", () => { goTo(current + 1); stopAuto(); startAuto(); });

    // Pause on hover
    slider.addEventListener("mouseenter", stopAuto);
    slider.addEventListener("mouseleave", startAuto);

    // Touch swipe support
    let touchStartX = 0;
    slider.addEventListener("touchstart", (e) => { touchStartX = e.touches[0].clientX; }, { passive: true });
    slider.addEventListener("touchend", (e) => {
      const diff = touchStartX - e.changedTouches[0].clientX;
      if (Math.abs(diff) > 40) {
        goTo(diff > 0 ? current + 1 : current - 1);
        stopAuto();
        startAuto();
      }
    }, { passive: true });

    startAuto();
  };

  const yearNode = document.querySelector("[data-year]");
  if (yearNode) {
    yearNode.textContent = new Date().getFullYear();
  }

  const initHeroVideoControls = () => {
    const btn = document.querySelector("#hero-sound-toggle");
    const video = document.querySelector("#hero-bg-video");
    if (!btn || !video) return;

    btn.addEventListener("click", () => {
      video.muted = !video.muted;
      const text = btn.querySelector(".control-text");
      const icon = btn.querySelector(".control-icon");
      if (video.muted) {
        if (text) text.textContent = "Unmute Workout Audio";
        if (icon) icon.textContent = "🔊";
      } else {
        if (text) text.textContent = "Mute Audio";
        if (icon) icon.textContent = "🔇";
        video.play().catch(() => {});
      }
    });
  };

  const initInteriorVideoSound = () => {
    const btn = document.querySelector("#interior-sound-toggle");
    const video = document.querySelector("#interior-tour-video");
    const tabs = document.querySelectorAll(".media-tab-btn");
    const badge = document.querySelector("#media-current-badge");
    if (!video) return;

    if (btn) {
      btn.addEventListener("click", () => {
        video.muted = !video.muted;
        if (video.muted) {
          btn.textContent = "🔊 Unmute Audio";
        } else {
          btn.textContent = "🔇 Mute Audio";
          video.play().catch(() => {});
        }
      });
    }

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const src = tab.dataset.videoSrc;
        const badgeText = tab.dataset.badge;
        if (!src) return;

        tabs.forEach((t) => t.classList.toggle("active", t === tab));
        if (badge && badgeText) badge.textContent = badgeText;

        const wasMuted = video.muted;
        video.pause();
        video.src = src;
        const sourceEl = video.querySelector("source");
        if (sourceEl) sourceEl.src = src;
        video.load();
        video.muted = wasMuted;
        video.play().catch(() => {});
      });
    });
  };

  setHeaderState();
  setActiveNav();
  initMobileNav();
  initRevealAnimations();
  initHeroFallback();
  initMediaFallbacks();
  initMembershipForm();
  initContactForm();
  initLoginForm();
  initTrainerModals();
  initGallery();
  initGymSlider();
  initHeroVideoControls();
  initInteriorVideoSound();

  window.addEventListener("scroll", setHeaderState, { passive: true });
});
