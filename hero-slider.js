
/* Notes Bazar — Smooth Premium Hero Carousel */
(function () {
  "use strict";

  function initHeroSlider() {
    var hero = document.querySelector("#homeView > .dynamic-bg");
    if (!hero || hero.dataset.premiumSlider === "2") return;

    var heading = hero.querySelector("h2");
    var description = hero.querySelector("p");
    if (!heading || !description) return;

    hero.dataset.premiumSlider = "2";

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
        subtitle: "Every page you study brings you closer to your goal.",
        colors: ["#9A3412", "#F97316", "#FDBA74"]
      },
      {
        title: "Believe in Yourself.",
        subtitle: "You are capable of more than you imagine.",
        colors: ["#14532D", "#16A34A", "#86EFAC"]
      },
      {
        title: "Your Dreams Deserve Effort.",
        subtitle: "Learn something today. Grow stronger tomorrow.",
        colors: ["#581C87", "#9333EA", "#D8B4FE"]
      },
      {
        title: "Study Today. Shine Tomorrow.",
        subtitle: "Your future begins with the effort you make now.",
        colors: ["#164E63", "#0891B2", "#67E8F9"]
      },
      {
        title: "Consistency Wins.",
        subtitle: "A little progress every day adds up to a lot.",
        colors: ["#881337", "#E11D48", "#FDA4AF"]
      },
      {
        title: "Progress, Not Perfection.",
        subtitle: "Keep learning. You do not need to be perfect.",
        colors: ["#713F12", "#CA8A04", "#FDE047"]
      },
      {
        title: "Make Yourself Proud.",
        subtitle: "Your effort today can shape your tomorrow.",
        colors: ["#312E81", "#4F46E5", "#A5B4FC"]
      },
      {
        title: "Keep Learning. Keep Growing.",
        subtitle: "Your next big achievement starts right here.",
        colors: ["#134E4A", "#0D9488", "#5EEAD4"]
      },
      {
        title: "One Goal. One Step at a Time.",
        subtitle: "Stay focused and trust your hard work.",
        colors: ["#374151", "#4B5563", "#9CA3AF"]
      }
    ];

    var index = 0;
    var timer = null;
    var resizeTimer = null;
    var reduceMotion = window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    var style = document.createElement("style");
    style.textContent = `
      #homeView > .dynamic-bg[data-premium-slider="2"] {
        box-sizing: border-box;
        width: 100%;
        max-width: 100%;
        overflow: hidden;
        border-radius: 26px;
        padding: clamp(30px, 4vw, 52px) 24px;
        background-image: linear-gradient(120deg, #173B73, #2563EB, #06B6D4);
        color: white;
        box-shadow: 0 16px 42px rgba(15, 23, 42, .18);
        position: relative;
      }

      #homeView > .dynamic-bg[data-premium-slider="2"] h2 {
        color: white;
        line-height: 1.2;
        overflow-wrap: anywhere;
      }

      #homeView > .dynamic-bg[data-premium-slider="2"] p {
        color: rgba(255,255,255,.94);
      }

      .nb-hero-outgoing {
        position: fixed !important;
        z-index: 9999 !important;
        margin: 0 !important;
        pointer-events: none !important;
        box-sizing: border-box !important;
      }

      @media (max-width: 640px) {
        #homeView > .dynamic-bg[data-premium-slider="2"] {
          padding: 28px 18px;
          min-height: 215px;
          border-radius: 22px;
        }

        #homeView > .dynamic-bg[data-premium-slider="2"] h2 {
          font-size: clamp(25px, 6.5vw, 32px);
          line-height: 1.2;
          margin-bottom: 14px;
        }

        #homeView > .dynamic-bg[data-premium-slider="2"] p {
          font-size: 13px;
          line-height: 1.5;
          margin-bottom: 0;
        }
      }
    `;
    document.head.appendChild(style);

    function isMobile() {
      return window.matchMedia("(max-width: 640px)").matches;
    }

    function setSlide(slide, slideIndex) {
      heading.textContent = slide.title;
      description.textContent = isMobile()
        ? (slideIndex === 0
          ? "Learn, revise and grow every day."
          : slide.subtitle)
        : slide.subtitle;

      hero.style.backgroundImage =
        "linear-gradient(120deg, " + slide.colors.join(", ") + ")";
    }

    function scheduleNext(delay) {
      window.clearTimeout(timer);
      timer = window.setTimeout(showNext, delay);
    }

    function showNext() {
      index = (index + 1) % slides.length;

      if (reduceMotion || !hero.animate) {
        setSlide(slides[index], index);
        scheduleNext(8000);
        return;
      }

      /* Keep the outgoing card visible while the next card enters */
      var rect = hero.getBoundingClientRect();
      var outgoing = hero.cloneNode(true);

      outgoing.removeAttribute("id");
      outgoing.classList.add("nb-hero-outgoing");
      outgoing.style.left = rect.left + "px";
      outgoing.style.top = rect.top + "px";
      outgoing.style.width = rect.width + "px";
      outgoing.style.height = rect.height + "px";
      outgoing.style.backgroundImage = hero.style.backgroundImage;
      outgoing.style.borderRadius = getComputedStyle(hero).borderRadius;
      outgoing.style.padding = getComputedStyle(hero).padding;
      outgoing.style.transform = "translateX(0)";
      document.body.appendChild(outgoing);

      setSlide(slides[index], index);

      /* Both cards move at the same time — no blank white gap */
      var outgoingAnimation = outgoing.animate(
        [
          { transform: "translateX(0)", opacity: 1 },
          { transform: "translateX(-100%)", opacity: 1 }
        ],
        {
          duration: 650,
          easing: "cubic-bezier(.65, 0, .35, 1)",
          fill: "forwards"
        }
      );

      hero.animate(
        [
          { transform: "translateX(100%)", opacity: 1 },
          { transform: "translateX(0)", opacity: 1 }
        ],
        {
          duration: 650,
          easing: "cubic-bezier(.22, 1, .36, 1)",
          fill: "none"
        }
      );

      outgoingAnimation.onfinish = function () {
        outgoing.remove();
      };

      scheduleNext(8650);
    }

    setSlide(slides[0], 0);

    window.addEventListener("resize", function () {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(function () {
        setSlide(slides[index], index);
      }, 150);
    });

    /* Original hero stays for 8 seconds before the first change */
    scheduleNext(8000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initHeroSlider);
  } else {
    initHeroSlider();
  }
})();
