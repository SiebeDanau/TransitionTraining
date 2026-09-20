const menu = document.getElementById("menu");
const menuStatus = document.getElementById("menuStatus");

Promise.all([
  fetch("data/config.json", { cache: "no-store" }).then(checkResponse),
  fetch("data/roles.json", { cache: "no-store" }).then(checkResponse),
])
  .then(([config, roleConfig]) => {
    const roles = Array.isArray(roleConfig.roles) ? roleConfig.roles : [];

    config.modules.forEach((module) => {
      const card = document.createElement("section");
      card.className = "module-card";

      const title = document.createElement("h2");
      title.textContent = module.title;
      card.appendChild(title);

      if (module.description) {
        const description = document.createElement("p");
        description.textContent = module.description;
        card.appendChild(description);
      }

      const actions = document.createElement("div");
      actions.className = "module-actions";

      const openButton = document.createElement("button");
      openButton.type = "button";
      openButton.textContent = "Module laden";
      if (module.requiresRole !== false) {
        const field = document.createElement("label");
        field.className = "role-field";
        field.textContent = "Rol";
        const roleSelect = document.createElement("select");
        roleSelect.setAttribute("aria-label", `Rol voor ${module.title}`);
        roleSelect.add(new Option("Selecteer een rol", ""));
        [...roles].sort((a, b) => a.label.localeCompare(b.label, "nl"))
          .forEach((role) => roleSelect.add(new Option(role.label, role.id)));
        field.appendChild(roleSelect);
        const objectField = document.createElement("div");
        objectField.className = "role-field";
        const objectLabel = document.createElement("span");
        objectLabel.textContent = "Objecten";
        const dropdown = document.createElement("details");
        dropdown.className = "object-dropdown";
        const summary = document.createElement("summary");
        summary.textContent = "Selecteer eerst een rol";
        summary.setAttribute("aria-label", `Objecten voor ${module.title}`);
        const options = document.createElement("div");
        options.className = "object-options";
        dropdown.append(summary, options);
        objectField.append(objectLabel, dropdown);
        let objectInputs = [];
        const selectedIds = () => objectInputs.filter(input => input.checked).map(input => input.value);
        const addOption = (label, value) => {
          const row = document.createElement("label");
          const input = document.createElement("input");
          input.type = "checkbox";
          input.value = value;
          input.checked = true;
          row.append(input, document.createTextNode(label));
          options.appendChild(row);
          return input;
        };
        dropdown.addEventListener("keydown", event => {
          if (event.key === "Escape") {
            dropdown.open = false;
            summary.focus();
          }
        });
        document.addEventListener("click", event => {
          if (!dropdown.contains(event.target)) dropdown.open = false;
        });
        openButton.disabled = true;
        roleSelect.addEventListener("change", () => {
          dropdown.open = false;
          options.replaceChildren();
          objectInputs = [];
          const role = roles.find(item => item.id === roleSelect.value);
          const category = role?.categories?.[module.id];
          const ids = [...new Set(category?.pointIds || category?.routeIds || [])]
            .sort((a, b) => a.localeCompare(b, "nl", { numeric: true }));
          const all = addOption("Alles", "");
          objectInputs = ids.map(id => addOption(id, id));
          const update = () => {
            const count = selectedIds().length;
            all.checked = count > 0 && count === ids.length;
            all.indeterminate = count > 0 && count < ids.length;
            all.disabled = !ids.length;
            summary.textContent = !role ? "Selecteer eerst een rol" : !ids.length ? "Geen objecten beschikbaar" : `${count} van ${ids.length} geselecteerd`;
            openButton.disabled = !role || !count;
          };
          all.addEventListener("change", () => {
            objectInputs.forEach(input => { input.checked = all.checked; });
            update();
          });
          objectInputs.forEach(input => input.addEventListener("change", update));
          update();
        });
        openButton.addEventListener("click", () => {
          const role = roles.find((item) => item.id === roleSelect.value);
          if (role && selectedIds().length) openModule(module, role, selectedIds());
        });
        actions.append(field, objectField, openButton);
      } else {
        openButton.addEventListener("click", () => openModule(module));
        actions.append(openButton);
      }
      card.appendChild(actions);
      menu.appendChild(card);
    });
  })
  .catch((error) => {
    menuStatus.textContent = `De modules en rollen konden niet geladen worden: ${error.message}`;
  });

function checkResponse(response) {
  if (!response.ok) {
    throw new Error(`${response.url} (${response.status})`);
  }
  return response.json();
}

function openModule(module, role, objectIds) {
  localStorage.setItem("activeModule", JSON.stringify(module));
  if (role && objectIds) {
    localStorage.setItem("activeQuizSelection", JSON.stringify({ moduleId: module.id, roleId: role.id, objectIds }));
  } else {
    localStorage.removeItem("activeQuizSelection");
  }
  if (role) {
    localStorage.setItem("activeRole", JSON.stringify({ id: role.id, label: role.label }));
  } else {
    localStorage.removeItem("activeRole");
  }
  window.location.href = module.entry || "map.html";
}
