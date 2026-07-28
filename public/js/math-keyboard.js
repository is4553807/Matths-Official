(function () {
  "use strict";

  const KEYS = [
    {
      label: "√",
      insert: "sqrt()",
      move: -1,
      title: "제곱근",
    },
    {
      label: "∛",
      insert: "cbrt()",
      move: -1,
      title: "세제곱근",
    },
    {
      label: "a⁄b",
      insert: "/",
      title: "분수",
    },
    {
      label: "xʸ",
      insert: "^()",
      move: -1,
      title: "거듭제곱",
    },
    {
      label: "π",
      insert: "pi",
      title: "원주율",
    },
    {
      label: "(",
      insert: "(",
    },
    {
      label: ")",
      insert: ")",
    },
    {
      label: "×",
      insert: "*",
    },
    {
      label: "−",
      insert: "-",
    },
    {
      label: ".",
      insert: ".",
    },
  ];

  function insertAtSelection(
    input,
    value,
    move = 0
  ) {
    const start =
      input.selectionStart ??
      input.value.length;
    const end =
      input.selectionEnd ?? start;

    input.setRangeText(
      value,
      start,
      end,
      "end"
    );

    const caret =
      start + value.length + move;

    input.setSelectionRange(
      caret,
      caret
    );
    input.focus();
    input.dispatchEvent(
      new Event("input", {
        bubbles: true,
      })
    );
  }

  function attach(input) {
    if (
      !input ||
      input.dataset.mathKeyboardReady ===
        "true"
    ) {
      return;
    }

    input.dataset.mathKeyboardReady =
      "true";
    input.inputMode = "text";

    const keyboard =
      document.createElement("div");
    keyboard.className = "math-keyboard";
    keyboard.setAttribute(
      "role",
      "group"
    );
    keyboard.setAttribute(
      "aria-label",
      "수학 기호 키보드"
    );

    KEYS.forEach((key) => {
      const button =
        document.createElement("button");
      button.type = "button";
      button.textContent = key.label;
      button.title =
        key.title || key.label;
      button.addEventListener(
        "click",
        () =>
          insertAtSelection(
            input,
            key.insert,
            key.move || 0
          )
      );
      keyboard.append(button);
    });

    input.insertAdjacentElement(
      "afterend",
      keyboard
    );
  }

  function attachAll(root = document) {
    root
      .querySelectorAll?.(
        "input[data-math-input]"
      )
      .forEach(attach);
  }

  window.MatthsMathKeyboard = {
    attach,
    attachAll,
  };

  const start = () => {
    attachAll();

    const observer =
      new MutationObserver(
        (mutations) => {
          mutations.forEach(
            (mutation) => {
              mutation.addedNodes.forEach(
                (node) => {
                  if (
                    node.nodeType !==
                    Node.ELEMENT_NODE
                  ) {
                    return;
                  }

                  if (
                    node.matches?.(
                      "input[data-math-input]"
                    )
                  ) {
                    attach(node);
                  }
                  attachAll(node);
                }
              );
            }
          );
        }
      );

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  };

  if (
    document.readyState === "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      start
    );
  } else {
    start();
  }
})();
