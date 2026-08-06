(() => {
  const categoryList = document.querySelector("[data-store-category-list]");
  const categoryOrderForm = document.querySelector("[data-store-category-order-form]");
  let draggedCategory = null;
  if (categoryList) {
    categoryList.addEventListener("dragstart", (event) => {
      const item = event.target.closest("[data-category-id]");
      if (!item) return;
      draggedCategory = item;
      item.classList.add("is-dragging");
      event.dataTransfer.effectAllowed = "move";
    });
    categoryList.addEventListener("dragover", (event) => {
      event.preventDefault();
      if (!draggedCategory) return;
      const siblings = [...categoryList.querySelectorAll("[data-category-id]:not(.is-dragging)")];
      const nextItem = siblings.find((item) => {
        const box = item.getBoundingClientRect();
        return event.clientY < box.top + box.height / 2;
      });
      categoryList.insertBefore(draggedCategory, nextItem || null);
    });
    categoryList.addEventListener("dragend", () => {
      draggedCategory?.classList.remove("is-dragging");
      draggedCategory = null;
    });
  }
  categoryOrderForm?.addEventListener("submit", () => {
    const ids = [...document.querySelectorAll("[data-store-category-list] [data-category-id]")]
      .map((item) => item.dataset.categoryId);
    categoryOrderForm.querySelector("[data-store-category-order-json]").value = JSON.stringify(ids);
  });

  const editor = document.querySelector("[data-store-editor]");
  const form = document.querySelector("[data-store-product-form]");
  if (!editor || !form) return;
  const list = editor.querySelector("[data-text-block-list]");
  const output = editor.querySelector("[data-detail-blocks-json]");
  let blocks = [];
  try { blocks = JSON.parse(editor.dataset.initialBlocks || "[]"); } catch (_error) { blocks = []; }

  function createBlock(block = {}) {
    const row = document.createElement("article");
    row.className = "store-editor-block";
    row.innerHTML = `
      <div class="store-editor-toolbar">
        <select data-field="fontSize" aria-label="글자 크기"><option value="small">작게</option><option value="normal">보통</option><option value="large">크게</option><option value="title">제목</option></select>
        <label>색상 <input type="color" data-field="color" value="#e9edf3" /></label>
        <label><input type="checkbox" data-field="bold" /> 굵게</label>
        <label><input type="checkbox" data-field="underline" /> 밑줄</label>
        <select data-field="align" aria-label="정렬"><option value="left">왼쪽</option><option value="center">가운데</option><option value="right">오른쪽</option></select>
        <button type="button" data-remove-block>삭제</button>
      </div>
      <textarea data-field="text" rows="5" maxlength="8000" placeholder="상세 설명 문구를 입력하세요."></textarea>`;
    row.querySelector('[data-field="fontSize"]').value = block.fontSize || "normal";
    row.querySelector('[data-field="color"]').value = /^#[0-9a-f]{6}$/i.test(block.color || "") ? block.color : "#e9edf3";
    row.querySelector('[data-field="bold"]').checked = block.bold === true;
    row.querySelector('[data-field="underline"]').checked = block.underline === true;
    row.querySelector('[data-field="align"]').value = block.align || "left";
    row.querySelector('[data-field="text"]').value = block.text || "";
    row.querySelector("[data-remove-block]").addEventListener("click", () => row.remove());
    list.append(row);
  }

  (blocks.length ? blocks : [{}]).forEach(createBlock);
  editor.querySelector("[data-add-text-block]").addEventListener("click", () => createBlock({}));
  form.addEventListener("submit", () => {
    const serialized = [...list.querySelectorAll(".store-editor-block")].map((row) => ({
      type: "TEXT",
      text: row.querySelector('[data-field="text"]').value,
      fontSize: row.querySelector('[data-field="fontSize"]').value,
      color: row.querySelector('[data-field="color"]').value,
      bold: row.querySelector('[data-field="bold"]').checked,
      underline: row.querySelector('[data-field="underline"]').checked,
      align: row.querySelector('[data-field="align"]').value,
    })).filter((block) => block.text.trim());
    output.value = JSON.stringify(serialized);
  });
})();
