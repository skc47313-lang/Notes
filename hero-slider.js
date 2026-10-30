
/* Notes Bazar — Smooth Responsive Hero Slider v3 */
(function () {
  "use strict";

  function initHeroSlider() {
    var hero = document.querySelector("#homeView > .dynamic-bg");
    if (!hero || hero.dataset.premiumSlider === "3") return;

    var heading = hero.querySelector("h2");
    var description = hero.querySelector("p");
    if (!heading || !description) return;

    hero.dataset.premiumSlider = "3";

    var originalTitle = heading.textContent.trim();
    var originalDescription = description.textContent.trim();

    var slides = [
      {
        title: originalTitle,
        subtitle: originalDescription,
        colors: ["#173B73", "#2563EB", "#06B6D4"]
      },
      {
        title: "Small Steps. Big Success.",
        subtitle: "Every page brings you closer to your goal.",
        colors: ["#9A3412", "#F97316", "#FDBA74"]
      },
      {
        title: "Believe in Yourself.",
        subtitle: "You are capable of more than you imagine.",
        colors: ["#14532D", "#16A34A", "#86EFAC"]
      },
      {
        title: "Your Dreams Deserve Effort.",
        subtitle: "Learn today. Grow stronger tomorrow.",
        colors: ["#581C87", "#9333EA", "#D8B4FE"]
      },
      {
        title: "Study Today. Shine Tomorrow.",
        subtitle: "Your future begins with today's effort.",
        colors: ["#164E63", "#0891B2", "#67E8F9"]
      },
      {
        title: "Consistency Wins.",
        subtitle: "Small progress every day adds up.",
        colors: ["#881337", "#E11D48", "#FDA4AF"]
      },
      {
        title: "Progress, Not Perfection.",
        subtitle: "Keep learning. Keep moving forward.",
        colors: ["#713F12", "#CA8A04", "#FDE047"]
      },
      {
        title: "Make Yourself Proud.",
        subtitle: "Your effort today shapes your tomorrow.",
        colors: ["#312E81", "#4F46E5", "#A5B4FC"]
      },
      {
        title: "Keep Learning. Keep Growing.",
        subtitle: "Your next achievement starts right here.",
        colors: ["#134E4A", "#0D9488", "#5EEAD4"]
      }
    ];

    var index = 0;
    var timer;
    var resizeTimer;
    var reduceMotion = window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    var style = document.createElement("style");
    style.textContent = `
      #homeView > .dynamic-bg[data-premium-slider="3"] {
        box-sizing: border-box;
        width: 100%;
        max-width: 100%;
        overflow: hidden;
        border-radius: 26px;
        padding: clamp(30px, 4vw, 52px) 24px;
        color: white;
        box-shadow: 0 16px 42px rgba(15, 23, 42, .18);
        will-change: transform;
      }

      #homeView > .dynamic-bg[data-premium-slider="3"] h2,
      #homeView > .dynamic-bg[data-premium-slider="3"] p {
        color: white !important;
      }

      .nb-hero-slider-clone {
        position: fixed !important;
        z-index: 99999 !important;
        margin: 0 !important;
        pointer-events: none !important;
        box-sizing: border-box !important;
        max-width: none !important;
      }

      @media (max-width: 640px) {
        #homeView > .dynamic-bg[data-premium-slider="3"] {
          padding: 28px 18px;
          min-height: 215px;
          border-radius: 22px;
        }

        #homeView > .dynamic-bg[data-premium-slider="3"] h2 {
          font-size: clamp(25px, 6.5vw, 32px);
          line-height: 1.2;
          margin-bottom: 14px;
        }

        #homeView > .dynamic-bg[data-premium-slider="3"] p {
          font-size: 13px;
          line-height: 1.5;
          margin-bottom: 0;
        }
      }
    `;
    document.head.appendChild(style);

    function gradient(slide) {
      return "linear-gradient(120deg, " +
        slide.colors.join(", ") + ")";
    }

    function setSlide(slide, slideIndex) {
      heading.textContent = slide.title;

      description.textContent =
        window.matchMedia("(max-width: 640px)").matches
          ? (slideIndex === 0
              ? "Learn, revise and grow every day."
              : slide.subtitle)
          : slide.subtitle;

      /* Override older background declarations too */
      hero.style.setProperty(
        "background-image",
        gradient(slide),
        "important"
      );
      hero.style.setProperty("background-color", slide.colors[0], "important");
    }

    function removeIds(element) {
      element.removeAttribute("id");
      element.querySelectorAll("[id]").forEach(function (node) {
        node.removeAttribute("id");
      });
    }

    function showNext() {
      index = (index + 1) % slides.length;

      if (reduceMotion || !hero.animate) {
        setSlide(slides[index], index);
        timer = window.setTimeout(showNext, 8000);
        return;
      }

      var rect = hero.getBoundingClientRect();

      /* If hidden or not laid out, skip animation safely */
      if (!rect.width || !rect.height) {
        setSlide(slides[index], index);
        timer = window.setTimeout(showNext, 8000);
        return;
      }

      /* Snapshot the old card before changing its content */
      var clone = hero.cloneNode(true);
      var computed = window.getComputedStyle(hero);

      for (var i = 0; i < computed.length; i++) {
        var property = computed[i];
        try {
          clone.style.setProperty(
            property,
            computed.getPropertyValue(property),
            computed.getPropertyPriority(property)
          );
        } catch (e) {}
      }

      removeIds(clone);
      clone.classList.add("nb-hero-slider-clone");
      clone.style.setProperty("position", "fixed", "important");
      clone.style.setProperty("left", rect.left + "px", "important");
      clone.style.setProperty("top", rect.top + "px", "important");
      clone.style.setProperty("width", rect.width + "px", "important");
      clone.style.setProperty("height", rect.height + "px", "important");
      clone.style.setProperty("margin", "0", "important");
      clone.style.setProperty("z-index", "99999", "important");
      clone.style.setProperty("transform", "translateX(0)", "important");
      clone.style.setProperty("opacity", "1", "important");
      clone.style.setProperty("background-image", gradient(slides[index]), "important");

      document.body.appendChild(clone);

      setSlide(slides[index], index);

      /* Both cards travel together, so no empty white interval */
      var oldAnimation = clone.animate(
        [
          { transform: "translateX(0)" },
          { transform: "translateX(-105%)" }
        ],
        {
          duration: 700,
          easing: "cubic-bezier(.65, 0, .35, 1)",
          fill: "forwards"
        }
      );

      var newAnimation = hero.animate(
        [
          { transform: "translateX(105%)" },
          { transform: "translateX(0)" }
        ],
        {
          duration: 700,
          easing: "cubic-bezier(.22, 1, .36, 1)",
          fill: "none"
        }
      );

      oldAnimation.onfinish = function () {
        clone.remove();
      };

      newAnimation.onfinish = function () {
        hero.style.removeProperty("transform");
      };

      /* 8 seconds reading time after the transition */
      timer = window.setTimeout(showNext, 8700);
    }

    setSlide(slides[0], 0);

    window.addEventListener("resize", function () {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(function () {
        setSlide(slides[index], index);
      }, 200);
    });

    /* Keep the first slide visible for 8 seconds */
    timer = window.setTimeout(showNext, 8000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initHeroSlider);
  } else {
    initHeroSlider();
  }
})();
