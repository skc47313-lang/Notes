
/* Notes Bazar — Premium Responsive Hero Slider */
(function () {
  "use strict";

  function initHeroSlider() {
    var hero = document.querySelector("#homeView > .dynamic-bg");

    if (!hero || hero.dataset.premiumSlider === "4") return;

    var heading = hero.querySelector("h2");
    var description = hero.querySelector("p");

    if (!heading || !description) return;

    hero.dataset.premiumSlider = "4";

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
    var timer = null;
    var resizeTimer = null;
    var isTransitioning = false;

    var motionPreference = window.matchMedia
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : null;

    function prefersReducedMotion() {
      return motionPreference && motionPreference.matches;
    }

    var style = document.createElement("style");

    style.textContent = `
      #homeView > .dynamic-bg[data-premium-slider="4"] {
        box-sizing: border-box;
        width: 100%;
        max-width: 100%;
        overflow: hidden;
        border-radius: 26px;
        padding: clamp(30px, 4vw, 52px) 24px;
        color: #fff;
        box-shadow: 0 16px 42px rgba(15, 23, 42, .18);
        backface-visibility: hidden;
      }

      #homeView > .dynamic-bg[data-premium-slider="4"] h2,
      #homeView > .dynamic-bg[data-premium-slider="4"] p {
        color: #fff !important;
      }

      @media (max-width: 640px) {
        #homeView > .dynamic-bg[data-premium-slider="4"] {
          padding: 28px 18px;
          min-height: 215px;
          border-radius: 22px;
        }

        #homeView > .dynamic-bg[data-premium-slider="4"] h2 {
          font-size: clamp(25px, 6.5vw, 32px);
          line-height: 1.2;
          margin-bottom: 14px;
        }

        #homeView > .dynamic-bg[data-premium-slider="4"] p {
          font-size: 13px;
          line-height: 1.5;
          margin-bottom: 0;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        #homeView > .dynamic-bg[data-premium-slider="4"] {
          scroll-behavior: auto;
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

      hero.style.setProperty(
        "background-image",
        gradient(slide),
        "important"
      );

      hero.style.setProperty(
        "background-color",
        slide.colors[0],
        "important"
      );
    }

    function scheduleNext(delay) {
      window.clearTimeout(timer);
      timer = window.setTimeout(showNext, delay);
    }

    function showNext() {
      if (isTransitioning) return;

      var nextIndex = (index + 1) % slides.length;

      if (prefersReducedMotion() || !hero.animate) {
        index = nextIndex;
        setSlide(slides[index], index);
        scheduleNext(6000);
        return;
      }

      isTransitioning = true;

      /*
       * First exit the current slide.
       * Do not use fixed-position clones or a high z-index.
       */
      var exitAnimation = hero.animate(
        [
          { opacity: 1, transform: "translateX(0)" },
          { opacity: 0, transform: "translateX(-24px)" }
        ],
        {
          duration: 420,
          easing: "cubic-bezier(.45, 0, .25, 1)",
          fill: "forwards"
        }
      );

      exitAnimation.onfinish = function () {
        index = nextIndex;
        setSlide(slides[index], index);

        /*
         * Only update the content after the old slide has exited.
         * Then animate the new slide into place.
         */
        var enterAnimation = hero.animate(
          [
            { opacity: 0, transform: "translateX(24px)" },
            { opacity: 1, transform: "translateX(0)" }
          ],
          {
            duration: 520,
            easing: "cubic-bezier(.22, 1, .36, 1)",
            fill: "none"
          }
        );

        enterAnimation.onfinish = function () {
          isTransitioning = false;
          scheduleNext(6000);
        };

        enterAnimation.oncancel = function () {
          isTransitioning = false;
          scheduleNext(6000);
        };
      };

      exitAnimation.oncancel = function () {
        isTransitioning = false;
        scheduleNext(6000);
      };
    }

    setSlide(slides[0], 0);

    window.addEventListener("resize", function () {
      window.clearTimeout(resizeTimer);

      resizeTimer = window.setTimeout(function () {
        if (!isTransitioning) {
          setSlide(slides[index], index);
        }
      }, 200);
    });

    /* Show the initial slide for six seconds. */
    scheduleNext(6000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initHeroSlider);
  } else {
    initHeroSlider();
  }
})();
