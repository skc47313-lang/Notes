
/* Notes Bazar — Hero Motivation Slider */
(function () {
  "use strict";

  function initMotivationSlider() {
    var hero = document.querySelector("#homeView > .dynamic-bg");
    var heading = hero && hero.querySelector("h2");

    if (!heading || heading.dataset.motivationSlider === "1") return;

    var messages = [
      heading.textContent.trim(),
      "Small Steps Every Day Lead to Big Success.",
      "Believe in Yourself. You Are Capable of More.",
      "Your Dreams Deserve Your Daily Effort.",
      "Study Today. Make Tomorrow Proud.",
      "Consistency Beats Motivation. Keep Going!",
      "Every Page You Read Is Progress.",
      "Focus on Progress, Not Perfection.",
      "Your Future Starts With What You Do Today.",
      "Hard Work Today Creates More Choices Tomorrow.",
      "Keep Learning. Keep Growing. Keep Going."
    ];

    heading.dataset.motivationSlider = "1";

    var text = document.createElement("span");
    text.style.display = "inline-block";
    text.style.maxWidth = "100%";
    text.textContent = messages[0];

    heading.textContent = "";
    heading.appendChild(text);

    var index = 0;
    var reducedMotion = window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function showNext() {
      index = (index + 1) % messages.length;

      if (reducedMotion || !text.animate) {
        text.textContent = messages[index];
        return;
      }

      var exitAnimation = text.animate(
        [
          { transform: "translateX(0)", opacity: 1 },
          { transform: "translateX(-45px)", opacity: 0 }
        ],
        { duration: 350, easing: "ease-in", fill: "forwards" }
      );

      exitAnimation.onfinish = function () {
        text.textContent = messages[index];

        text.animate(
          [
            { transform: "translateX(45px)", opacity: 0 },
            { transform: "translateX(0)", opacity: 1 }
          ],
          { duration: 450, easing: "ease-out" }
        );
      };
    }

    window.setTimeout(function () {
      showNext();
      window.setInterval(showNext, 4000);
    }, 2000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initMotivationSlider);
  } else {
    initMotivationSlider();
  }
})();
