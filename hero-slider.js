
/* Notes Bazar — Premium Responsive Hero Slider */
(function () {
  "use strict";

  function initHeroSlider() {
    var hero = document.querySelector("#homeView > .dynamic-bg");
    if (!hero || hero.dataset.premiumSlider === "1") return;

    var heading = hero.querySelector("h2");
    var description = hero.querySelector("p");
    if (!heading || !description) return;

    hero.dataset.premiumSlider = "1";

    var originalTitle = heading.textContent.trim();
    var originalDescription = description.textContent.trim();

    var slides = [
      {
        title: originalTitle,
        subtitle: originalDescription,
        colors: ["#183B75", "#2563EB", "#06B6D4"]
      },
      {
        title: "Small Steps. Big Success.",
        subtitle: "Every page you study brings you closer to your goal.",
        colors: ["#312E81", "#6D28D9", "#C026D3"]
      },
      {
        title: "Believe in Yourself.",
        subtitle: "You are capable of more than you imagine.",
        colors: ["#064E3B", "#059669", "#14B8A6"]
      },
      {
        title: "Your Dreams Deserve Effort.",
        subtitle: "Learn something today. Grow stronger tomorrow.",
        colors: ["#7C2D12", "#EA580C", "#F59E0B"]
      },
      {
        title: "Study Today. Shine Tomorrow.",
        subtitle: "Your future begins with the effort you make now.",
        colors: ["#172554", "#1D4ED8", "#7C3AED"]
      },
      {
        title: "Consistency Wins.",
        subtitle: "A little progress every day adds up to a lot.",
        colors: ["#134E4A", "#0F766E", "#22C55E"]
      },
      {
        title: "Progress, Not Perfection.",
        subtitle: "Keep learning. You do not need to be perfect.",
        colors: ["#4A1942", "#9D174D", "#E11D48"]
      },
      {
        title: "One Goal. One Step at a Time.",
        subtitle: "Stay focused and trust your hard work.",
        colors: ["#1E3A8A", "#0369A1", "#0891B2"]
      },
      {
        title: "Make Yourself Proud.",
        subtitle: "The effort you make today will matter tomorrow.",
        colors: ["#3F3F46", "#52525B", "#A16207"]
      },
      {
        title: "Keep Learning. Keep Growing.",
        subtitle: "Your next big achievement starts right here.",
        colors: ["#3B0764", "#7E22CE", "#DB2777"]
      }
    ];

    var index = 0;
    var reduceMotion = window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    /* Responsive styling without editing the other files */
    var style = document.createElement("style");
    style.textContent = `
      #homeView > .dynamic-bg[data-premium-slider="1"] {
        box-sizing: border-box;
        width: 100%;
        max-width: 100%;
        overflow: hidden;
        border-radius: 26px;
        padding: clamp(28px, 4vw, 52px) 24px;
        background-image: linear-gradient(120deg, #183B75, #2563EB, #06B6D4) !important;
        color: #fff;
        box-shadow: 0 16px 42px rgba(15, 23, 42, .18);
        will-change: transform, opacity;
      }

      #homeView > .dynamic-bg[data-premium-slider="1"] h2 {
        color: #fff;
        line-height: 1.18;
        overflow-wrap: anywhere;
      }

      #homeView > .dynamic-bg[data-premium-slider="1"] p {
        color: rgba(255, 255, 255, .92);
      }

      @media (max-width: 640px) {
        #homeView > .dynamic-bg[data-premium-slider="1"] {
          padding: 28px 18px;
          min-height: 215px;
          border-radius: 22px;
        }

        #homeView > .dynamic-bg[data-premium-slider="1"] h2 {
          font-size: clamp(25px, 6.5vw, 32px);
          line-height: 1.2;
          margin-bottom: 14px;
        }

        #homeView > .dynamic-bg[data-premium-slider="1"] p {
          font-size: 13px;
          line-height: 1.5;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 100%;
          margin-bottom: 0;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        #homeView > .dynamic-bg[data-premium-slider="1"] {
          will-change: auto;
        }
      }
    `;
    document.head.appendChild(style);

    function setMobileDescription(slide) {
      if (window.matchMedia("(max-width: 640px)").matches) {
        description.textContent =
          index === 0
            ? "Your trusted space to learn, revise and grow."
            : slide.subtitle;
      } else {
        description.textContent = slide.subtitle;
      }
    }

    function setSlide(slide) {
      heading.textContent = slide.title;
      setMobileDescription(slide);
      hero.style.backgroundImage =
        "linear-gradient(120deg, " + slide.colors.join(", ") + ")";
    }

    /* Show the original hero first */
    setSlide(slides[0]);

    function showNext() {
      index = (index + 1) % slides.length;
      var nextSlide = slides[index];

      if (reduceMotion || !hero.animate) {
        setSlide(nextSlide);
        window.setTimeout(showNext, 6000);
        return;
      }

      var exitAnimation = hero.animate(
        [
          { transform: "translateX(0)", opacity: 1 },
          { transform: "translateX(-100%)", opacity: 0 }
        ],
        {
          duration: 500,
          easing: "cubic-bezier(.65, 0, .35, 1)",
          fill: "forwards"
        }
      );

      exitAnimation.onfinish = function () {
        setSlide(nextSlide);

        var enterAnimation = hero.animate(
          [
            { transform: "translateX(100%)", opacity: 0 },
            { transform: "translateX(0)", opacity: 1 }
          ],
          {
            duration: 650,
            easing: "cubic-bezier(.22, 1, .36, 1)",
            fill: "none"
          }
        );

        enterAnimation.onfinish = function () {
          window.setTimeout(showNext, 6000);
        };
      };
    }

    /* Keep the mobile description correct if screen size changes */
    window.addEventListener("resize", function () {
      setMobileDescription(slides[index]);
    });

    /* Let visitors read the first slide before changing it */
    window.setTimeout(showNext, 6000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initHeroSlider);
  } else {
    initHeroSlider();
  }
})();
