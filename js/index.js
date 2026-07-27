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

      const field = document.createElement("label");
      field.className = "role-field";
      field.textContent = "Rol";

      const roleSelect = document.createElement("select");
      roleSelect.setAttribute("aria-label", `Rol voor ${module.title}`);
      roleSelect.add(new Option("Selecteer een rol", ""));
      [...roles]
        .sort((a, b) => a.label.localeCompare(b.label, "nl"))
        .forEach((role) => roleSelect.add(new Option(role.label, role.id)));
      field.appendChild(roleSelect);

      const openButton = document.createElement("button");
      openButton.type = "button";
      openButton.textContent = "Module laden";
      openButton.disabled = true;
      roleSelect.addEventListener("change", () => {
        openButton.disabled = !roleSelect.value;
      });
      openButton.addEventListener("click", () => {
        const role = roles.find((item) => item.id === roleSelect.value);
        if (role) openModule(module, role);
      });

      actions.append(field, openButton);
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

function openModule(module, role) {
  localStorage.setItem("activeModule", JSON.stringify(module));
  localStorage.setItem(
    "activeRole",
    JSON.stringify({ id: role.id, label: role.label })
  );

  window.location.href = "map.html";
}
